from __future__ import annotations

import hashlib
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from statistics import mean, stdev

from app.schemas.backtests import BacktestConfig, BacktestResult, StrategyKind, StrategySpec
from app.schemas.strategy_ir import StrategyIR
from app.schemas.walk_forward import (
    ParameterSurfacePoint,
    SearchDimension,
    ValidationMetrics,
    WalkForwardAggregate,
    WalkForwardComparison,
    WalkForwardConfig,
    WalkForwardCurvePoint,
    WalkForwardResult,
    WalkForwardWindowResult,
)
from app.services.backtest_analysis import enrich_backtest_result
from app.services.backtest_data import LoadedBacktestData
from app.services.backtest_engine import merge_signal_diagnostics, run_backtest
from app.services.strategy_ir import ensure_search_parameters, strategy_ir_hash


ENGINE_NAME = "stonksup-walk-forward.v2"


@dataclass
class TrialRecord:
    window_sequence: int
    period: int
    stop_loss: float
    objective_score: float
    robust_score: float
    eligible: bool
    selected: bool
    metrics: ValidationMetrics


@dataclass
class WalkForwardExecution:
    result: WalkForwardResult
    trials: list[TrialRecord]


@dataclass
class _Candidate:
    period: int
    stop_loss: float
    score: float
    robust_score: float
    eligible: bool
    result: BacktestResult
    strategy: StrategySpec
    strategy_ir: StrategyIR | None


@dataclass(frozen=True)
class _SearchTarget:
    name: str
    strategy_field: str | None = None
    indicator_id: str | None = None


def _primary_parameter(
    strategy: StrategySpec,
    strategy_ir: StrategyIR | None,
) -> _SearchTarget:
    if strategy.kind == StrategyKind.CUSTOM_IR:
        if strategy_ir is None:
            raise ValueError("Custom IR walk-forward requires an explicit Strategy IR")
        if not strategy_ir.search_parameters:
            raise ValueError("Custom IR has no declared search parameter")
        parameter = strategy_ir.search_parameters[0]
        return _SearchTarget(
            name=f"indicator.{parameter.indicator_id}.period",
            indicator_id=parameter.indicator_id,
        )
    field = {
        StrategyKind.EMA_PULLBACK: "entry_ema_period",
        StrategyKind.MA_CROSSOVER: "fast_period",
        StrategyKind.MOMENTUM_BREAKOUT: "lookback_period",
        StrategyKind.RSI_MEAN_REVERSION: "rsi_period",
    }[strategy.kind]
    return _SearchTarget(name=field, strategy_field=field)


def _stop_values(start: float, end: float, step: float) -> list[float]:
    count = math.floor((end - start) / step + 1e-9)
    return [round(start + index * step, 6) for index in range(count + 1)]


def _candidate_contract(
    strategy: StrategySpec,
    strategy_ir: StrategyIR | None,
    target: _SearchTarget,
    period: int,
    stop_loss: float,
) -> tuple[StrategySpec, StrategyIR | None] | None:
    try:
        candidate_strategy = StrategySpec.model_validate(
            {
                **strategy.model_dump(),
                **(
                    {target.strategy_field: period}
                    if target.strategy_field is not None
                    else {}
                ),
                "stop_loss_percent": stop_loss,
            }
        )
        if target.indicator_id is None:
            return candidate_strategy, None
        if strategy_ir is None:
            return None
        indicators = [
            item.model_copy(update={"period": period})
            if item.id == target.indicator_id
            else item
            for item in strategy_ir.indicators
        ]
        if all(item.id != target.indicator_id for item in strategy_ir.indicators):
            return None
        candidate_ir = StrategyIR.model_validate(
            strategy_ir.model_copy(
                update={
                    "indicators": indicators,
                    "risk": strategy_ir.risk.model_copy(
                        update={"stop_loss_percent": stop_loss}
                    ),
                },
                deep=True,
            ).model_dump(mode="json")
        )
        return candidate_strategy, candidate_ir
    except ValueError:
        return None


def _metrics(result: BacktestResult) -> ValidationMetrics:
    return ValidationMetrics(
        total_return=result.total_return,
        annualized_return=result.annualized_return,
        max_drawdown=result.max_drawdown,
        sharpe_ratio=result.sharpe_ratio,
        calmar_ratio=result.calmar_ratio,
        trade_count=result.trade_count,
        win_rate=result.win_rate,
    )


def _objective(result: BacktestResult, objective: str) -> float:
    value = {
        "calmar": result.calmar_ratio,
        "sharpe": result.sharpe_ratio,
        "annualized_return": result.annualized_return,
    }[objective]
    return value if math.isfinite(value) else -1_000_000


def _loaded_slice(
    loaded: LoadedBacktestData,
    rows,
    start_date,
    end_date,
) -> LoadedBacktestData:
    benchmark_rows = [
        row
        for row in loaded.benchmark_rows
        if start_date <= row.trading_date <= end_date
    ]
    return replace(loaded, rows=list(rows), benchmark_rows=benchmark_rows)


def _score_candidates(
    candidates: list[_Candidate],
    period_step: int,
    stop_step: float,
) -> None:
    for candidate in candidates:
        neighbors = [
            item.score
            for item in candidates
            if item.eligible
            and abs(item.period - candidate.period) <= period_step
            and abs(item.stop_loss - candidate.stop_loss) <= stop_step + 1e-9
        ]
        neighborhood_score = mean(neighbors) if neighbors else candidate.score
        candidate.robust_score = candidate.score * 0.7 + neighborhood_score * 0.3


def _aggregate_metrics(
    curve: list[WalkForwardCurvePoint],
    config: BacktestConfig,
    trade_count: int,
    winning_trades: int,
    parameter_stability: float,
    *,
    value_field: str = "strategy",
) -> WalkForwardAggregate:
    strategy_values = [getattr(point, value_field) for point in curve]
    asset_values = [point.asset for point in curve]
    benchmark_values = [
        point.benchmark for point in curve if point.benchmark is not None
    ]
    daily_returns = [
        strategy_values[index] / strategy_values[index - 1] - 1
        for index in range(1, len(strategy_values))
        if strategy_values[index - 1]
    ]
    initial = config.initial_capital
    final = strategy_values[-1]
    total_return = final / initial - 1
    years = max((len(strategy_values) - 1) / 252, 1 / 252)
    annualized_return = max(final / initial, 0.0001) ** (1 / years) - 1
    volatility = stdev(daily_returns) * math.sqrt(252) if len(daily_returns) > 1 else 0
    daily_risk_free = (1 + config.risk_free_rate_percent / 100) ** (1 / 252) - 1
    excess = [value - daily_risk_free for value in daily_returns]
    daily_stdev = stdev(daily_returns) if len(daily_returns) > 1 else 0
    sharpe = mean(excess) / daily_stdev * math.sqrt(252) if daily_stdev else 0
    running_peak = strategy_values[0]
    max_drawdown = 0.0
    for value in strategy_values:
        running_peak = max(running_peak, value)
        max_drawdown = min(max_drawdown, value / running_peak - 1 if running_peak else 0)
    calmar = annualized_return / abs(max_drawdown) if max_drawdown else 0
    asset_return = asset_values[-1] / initial - 1
    benchmark_return = benchmark_values[-1] / initial - 1 if benchmark_values else 0
    relative_return = (
        (1 + total_return) / (1 + benchmark_return) - 1
        if benchmark_return > -1
        else 0
    )
    return WalkForwardAggregate(
        initial_capital=initial,
        final_equity=round(final, 2),
        total_return=total_return,
        annualized_return=annualized_return,
        asset_return=asset_return,
        benchmark_return=benchmark_return,
        excess_return=total_return - benchmark_return,
        relative_return=relative_return,
        max_drawdown=max_drawdown,
        annualized_volatility=volatility,
        sharpe_ratio=sharpe,
        calmar_ratio=calmar,
        trade_count=trade_count,
        win_rate=winning_trades / trade_count if trade_count else 0,
        parameter_stability=parameter_stability,
    )


def _baseline_period(
    strategy: StrategySpec,
    strategy_ir: StrategyIR | None,
    target: _SearchTarget,
) -> float:
    if target.strategy_field is not None:
        return float(getattr(strategy, target.strategy_field))
    if strategy_ir is None or target.indicator_id is None:
        raise ValueError("Walk-forward search target has no baseline value")
    indicator = next(
        (item for item in strategy_ir.indicators if item.id == target.indicator_id),
        None,
    )
    if indicator is None:
        raise ValueError("Walk-forward search target indicator is missing")
    return float(indicator.period)


def _search_dimensions(
    strategy: StrategySpec,
    strategy_ir: StrategyIR | None,
    target: _SearchTarget,
    validation: WalkForwardConfig,
) -> list[SearchDimension]:
    search = validation.search
    period_count = len(range(search.period_min, search.period_max + 1, search.period_step))
    stop_count = len(
        _stop_values(search.stop_loss_min, search.stop_loss_max, search.stop_loss_step)
    )
    stop_baseline = (
        strategy_ir.risk.stop_loss_percent
        if strategy_ir is not None
        else strategy.stop_loss_percent
    )
    return [
        SearchDimension(
            name=target.name,
            baseline=_baseline_period(strategy, strategy_ir, target),
            minimum=search.period_min,
            maximum=search.period_max,
            step=search.period_step,
            candidate_count=period_count,
            optimized=period_count > 1,
        ),
        SearchDimension(
            name="stop_loss_percent",
            baseline=stop_baseline,
            minimum=search.stop_loss_min,
            maximum=search.stop_loss_max,
            step=search.stop_loss_step,
            candidate_count=stop_count,
            optimized=stop_count > 1,
        ),
    ]


def _metrics_objective(metrics: ValidationMetrics, objective: str) -> float:
    return {
        "calmar": metrics.calmar_ratio,
        "sharpe": metrics.sharpe_ratio,
        "annualized_return": metrics.annualized_return,
    }[objective]


def _overfitting_diagnostics(
    windows: list[WalkForwardWindowResult],
    objective: str,
    aggregate: WalkForwardAggregate,
) -> tuple[str, float, float, list[str]]:
    train_scores = [window.objective_score for window in windows]
    test_scores = [
        {
            "calmar": window.test.calmar_ratio,
            "sharpe": window.test.sharpe_ratio,
            "annualized_return": window.test.annualized_return,
        }[objective]
        for window in windows
    ]
    average_train = mean(train_scores)
    average_test = mean(test_scores)
    warnings: list[str] = []
    risk_points = 0
    if average_train > 0 and average_test <= 0:
        warnings.append("参数选择期目标为正，但样本外目标降至零以下。")
        risk_points += 2
    elif average_train > 0 and average_test < average_train * 0.5:
        warnings.append("样本外目标不足参数选择期的一半，存在明显性能衰减。")
        risk_points += 1
    if aggregate.parameter_stability < 0.4:
        warnings.append("各窗口选择的参数分散，参数稳定性较低。")
        risk_points += 1
    if aggregate.trade_count < len(windows) * 2:
        warnings.append("样本外交易数量较少，统计结论仍不稳定。")
        risk_points += 1
    if aggregate.total_return < 0:
        warnings.append("拼接后的样本外累计收益为负。")
        risk_points += 1
    if any(window.used_fallback for window in windows):
        warnings.append("至少一个窗口没有参数达到最低交易次数，已使用回退选择。")
        risk_points += 1
    risk = "high" if risk_points >= 3 else "medium" if risk_points >= 1 else "low"
    return risk, average_train, average_test, warnings


def run_walk_forward(
    loaded: LoadedBacktestData,
    strategy: StrategySpec,
    config: BacktestConfig,
    validation: WalkForwardConfig,
    *,
    strategy_ir: StrategyIR | None = None,
) -> WalkForwardExecution:
    rows = loaded.rows
    required = validation.train_bars + validation.test_bars * 2
    if len(rows) < required:
        raise ValueError(
            "Walk-forward requires at least "
            f"{required} bars for one parameter-selection window and two test windows"
        )

    executable_ir = (
        ensure_search_parameters(strategy_ir)
        if strategy.kind == StrategyKind.CUSTOM_IR and strategy_ir is not None
        else strategy_ir
    )
    if executable_ir is not None and executable_ir.symbol != strategy.symbol:
        raise ValueError("Strategy IR symbol must match the strategy specification")

    search = validation.search
    target = _primary_parameter(strategy, executable_ir)
    search_dimensions = _search_dimensions(
        strategy,
        executable_ir,
        target,
        validation,
    )
    period_values = list(
        range(search.period_min, search.period_max + 1, search.period_step)
    )
    stop_values = _stop_values(
        search.stop_loss_min,
        search.stop_loss_max,
        search.stop_loss_step,
    )
    windows: list[WalkForwardWindowResult] = []
    all_trials: list[TrialRecord] = []
    selected_results: list[BacktestResult] = []
    baseline_results: list[BacktestResult] = []
    selected_counts: Counter[tuple[int, float]] = Counter()
    surface_scores: dict[tuple[int, float], list[TrialRecord]] = defaultdict(list)

    test_cursor = validation.train_bars
    sequence = 1
    while test_cursor + validation.test_bars <= len(rows):
        train_start = test_cursor - validation.train_bars
        train_rows = rows[train_start:test_cursor]
        test_rows = rows[test_cursor : test_cursor + validation.test_bars]
        train_loaded = _loaded_slice(
            loaded,
            train_rows,
            train_rows[0].trading_date,
            train_rows[-1].trading_date,
        )
        candidates: list[_Candidate] = []

        for period in period_values:
            for stop_loss in stop_values:
                candidate_contract = _candidate_contract(
                    strategy,
                    executable_ir,
                    target,
                    period,
                    stop_loss,
                )
                if candidate_contract is None:
                    continue
                candidate_strategy, candidate_ir = candidate_contract
                candidate_result = enrich_backtest_result(
                    run_backtest(
                        train_rows,
                        candidate_strategy,
                        config,
                        strategy_ir=candidate_ir,
                    ),
                    train_loaded,
                    config,
                )
                score = _objective(candidate_result, search.objective)
                candidates.append(
                    _Candidate(
                        period=period,
                        stop_loss=stop_loss,
                        score=score,
                        robust_score=score,
                        eligible=candidate_result.trade_count >= search.minimum_trades,
                        result=candidate_result,
                        strategy=candidate_strategy,
                        strategy_ir=candidate_ir,
                    )
                )

        if not candidates:
            raise ValueError("No valid parameter candidates were produced")
        eligible = [candidate for candidate in candidates if candidate.eligible]
        used_fallback = not eligible
        selection_pool = eligible or candidates
        _score_candidates(candidates, search.period_step, search.stop_loss_step)
        selected = max(
            selection_pool,
            key=lambda item: (item.robust_score, item.score, -item.period, -item.stop_loss),
        )
        test_execution_rows = rows[train_start : test_cursor + validation.test_bars]
        test_loaded = _loaded_slice(
            loaded,
            test_execution_rows,
            test_rows[0].trading_date,
            test_rows[-1].trading_date,
        )
        test_result = enrich_backtest_result(
            run_backtest(
                test_execution_rows,
                selected.strategy,
                config,
                strategy_ir=selected.strategy_ir,
                trade_start_date=test_rows[0].trading_date,
            ),
            test_loaded,
            config,
        )
        baseline_result = enrich_backtest_result(
            run_backtest(
                test_execution_rows,
                strategy,
                config,
                strategy_ir=executable_ir,
                trade_start_date=test_rows[0].trading_date,
            ),
            test_loaded,
            config,
        )
        selected_results.append(test_result)
        baseline_results.append(baseline_result)
        selected_counts[(selected.period, selected.stop_loss)] += 1

        for candidate in candidates:
            trial = TrialRecord(
                window_sequence=sequence,
                period=candidate.period,
                stop_loss=candidate.stop_loss,
                objective_score=candidate.score,
                robust_score=candidate.robust_score,
                eligible=candidate.eligible,
                selected=candidate is selected,
                metrics=_metrics(candidate.result),
            )
            all_trials.append(trial)
            surface_scores[(candidate.period, candidate.stop_loss)].append(trial)

        windows.append(
            WalkForwardWindowResult(
                sequence=sequence,
                train_start=train_rows[0].trading_date.isoformat(),
                train_end=train_rows[-1].trading_date.isoformat(),
                test_start=test_rows[0].trading_date.isoformat(),
                test_end=test_rows[-1].trading_date.isoformat(),
                primary_parameter=target.name,
                selected_period=selected.period,
                selected_stop_loss=selected.stop_loss,
                objective_score=selected.score,
                robust_score=selected.robust_score,
                candidate_count=len(candidates),
                eligible_count=len(eligible),
                used_fallback=used_fallback,
                train=_metrics(selected.result),
                test=_metrics(test_result),
                baseline_test=_metrics(baseline_result),
                test_return_delta=(
                    test_result.total_return - baseline_result.total_return
                ),
            )
        )
        test_cursor += validation.test_bars
        sequence += 1

    strategy_capital = config.initial_capital
    baseline_capital = config.initial_capital
    asset_capital = config.initial_capital
    benchmark_capital = config.initial_capital
    peak = config.initial_capital
    curve: list[WalkForwardCurvePoint] = []
    trade_count = 0
    winning_trades = 0
    baseline_trade_count = 0
    baseline_winning_trades = 0
    for window, result, baseline_result in zip(
        windows,
        selected_results,
        baseline_results,
        strict=True,
    ):
        benchmark_by_date = {point.date: point.value for point in result.benchmark_curve}
        baseline_by_date = {
            point.date: point.strategy for point in baseline_result.equity_curve
        }
        for point in result.equity_curve:
            strategy_value = strategy_capital * point.strategy / config.initial_capital
            baseline_point = baseline_by_date[point.date]
            baseline_value = baseline_capital * baseline_point / config.initial_capital
            asset_value = asset_capital * point.benchmark / config.initial_capital
            benchmark_point = benchmark_by_date.get(point.date)
            benchmark_value = (
                benchmark_capital * benchmark_point / config.initial_capital
                if benchmark_point is not None
                else None
            )
            peak = max(peak, strategy_value)
            curve.append(
                WalkForwardCurvePoint(
                    date=point.date,
                    strategy=round(strategy_value, 2),
                    baseline=round(baseline_value, 2),
                    asset=round(asset_value, 2),
                    benchmark=(
                        round(benchmark_value, 2)
                        if benchmark_value is not None
                        else None
                    ),
                    drawdown=strategy_value / peak - 1 if peak else 0,
                    window=window.sequence,
                )
            )
        strategy_capital = curve[-1].strategy
        baseline_capital = curve[-1].baseline
        asset_capital = curve[-1].asset
        if curve[-1].benchmark is not None:
            benchmark_capital = curve[-1].benchmark
        trade_count += result.trade_count
        winning_trades += sum(1 for trade in result.trades if trade.pnl > 0)
        baseline_trade_count += baseline_result.trade_count
        baseline_winning_trades += sum(
            1 for trade in baseline_result.trades if trade.pnl > 0
        )

    stability = max(selected_counts.values()) / len(windows)
    aggregate = _aggregate_metrics(
        curve,
        config,
        trade_count,
        winning_trades,
        stability,
    )
    baseline_aggregate = _aggregate_metrics(
        curve,
        config,
        baseline_trade_count,
        baseline_winning_trades,
        1.0,
        value_field="baseline",
    )
    experiment_wins = 0
    baseline_wins = 0
    ties = 0
    for window in windows:
        experiment_score = _metrics_objective(window.test, search.objective)
        baseline_score = _metrics_objective(window.baseline_test, search.objective)
        if experiment_score > baseline_score + 1e-12:
            experiment_wins += 1
        elif baseline_score > experiment_score + 1e-12:
            baseline_wins += 1
        else:
            ties += 1
    total_return_delta = aggregate.total_return - baseline_aggregate.total_return
    if total_return_delta > 1e-12 and experiment_wins > baseline_wins:
        verdict = "experiment_outperforms"
    elif total_return_delta < -1e-12 and baseline_wins > experiment_wins:
        verdict = "baseline_outperforms"
    else:
        verdict = "mixed"
    comparison = WalkForwardComparison(
        baseline=baseline_aggregate,
        total_return_delta=total_return_delta,
        annualized_return_delta=(
            aggregate.annualized_return - baseline_aggregate.annualized_return
        ),
        max_drawdown_improvement=(
            aggregate.max_drawdown - baseline_aggregate.max_drawdown
        ),
        sharpe_delta=aggregate.sharpe_ratio - baseline_aggregate.sharpe_ratio,
        calmar_delta=aggregate.calmar_ratio - baseline_aggregate.calmar_ratio,
        trade_count_delta=aggregate.trade_count - baseline_aggregate.trade_count,
        experiment_wins=experiment_wins,
        baseline_wins=baseline_wins,
        ties=ties,
        verdict=verdict,
    )
    risk, average_train, average_test, warnings = _overfitting_diagnostics(
        windows,
        search.objective,
        aggregate,
    )
    if comparison.verdict == "baseline_outperforms":
        warnings.append("受控实验未超过固定参数基线，当前没有证据支持采用调参结果。")
    elif comparison.verdict == "mixed":
        warnings.append("受控实验与固定参数基线结论不一致，暂不宜仅凭调参结果决策。")
    surface = [
        ParameterSurfacePoint(
            period=period,
            stop_loss=stop_loss,
            mean_score=mean(trial.objective_score for trial in trials),
            mean_train_return=mean(trial.metrics.total_return for trial in trials),
            eligible_rate=sum(1 for trial in trials if trial.eligible) / len(trials),
            selected_count=sum(1 for trial in trials if trial.selected),
        )
        for (period, stop_loss), trials in sorted(surface_scores.items())
    ]
    experiment_payload = "|".join(
        [
            strategy.model_dump_json(),
            strategy_ir_hash(executable_ir) if executable_ir is not None else "",
            config.model_dump_json(),
            validation.model_dump_json(),
            loaded.quality.strategy_hash,
            loaded.quality.benchmark_hash,
            ENGINE_NAME,
        ]
    )
    experiment_id = (
        "WF-" + hashlib.sha256(experiment_payload.encode()).hexdigest()[:12].upper()
    )
    result = WalkForwardResult(
        experiment_id=experiment_id,
        symbol=strategy.symbol,
        strategy_name=strategy.name,
        strategy_kind=strategy.kind.value,
        engine=ENGINE_NAME,
        data_source=loaded.source,
        benchmark_symbol=loaded.benchmark_symbol,
        adjustment=loaded.adjustment,
        objective=search.objective,
        primary_parameter=target.name,
        train_bars=validation.train_bars,
        test_bars=validation.test_bars,
        window_count=len(windows),
        candidate_count=len(all_trials),
        overfitting_risk=risk,
        aggregate=aggregate,
        comparison=comparison,
        search_dimensions=search_dimensions,
        average_train_score=average_train,
        average_test_score=average_test,
        windows=windows,
        parameter_surface=surface,
        equity_curve=curve,
        warnings=warnings,
        assumptions=[
            "每个窗口仅使用参数选择期结果选择参数，测试期参数保持冻结。",
            "测试期可读取此前 K 线作为指标预热，但测试开始前不允许持仓或收益。",
            "各测试窗口从空仓开始，窗口收益按复利顺序拼接。",
            "固定参数基线使用输入策略的原始周期与止损，不参与任何窗口选优。",
            "参数稳定性和过拟合风险属于研究诊断，不构成统计显著性证明。",
            *loaded.assumptions,
        ],
        audit=[
            "PASS: every parameter-selection interval ends before its test interval begins.",
            "PASS: test bars never participate in parameter selection.",
            "PASS: selected parameters remain frozen throughout each test window.",
            "PASS: all candidate trials use the same cost and execution assumptions.",
            "PASS: tuned and fixed-baseline strategies use identical out-of-sample windows, warm-up bars, and costs.",
            "PASS: baseline parameters remain frozen across every out-of-sample window.",
            "PASS: identical configuration and OHLCV fingerprints produce the same experiment ID.",
            *loaded.audit,
            *loaded.quality.checks,
        ],
        data_quality=loaded.quality,
        signal_diagnostics=merge_signal_diagnostics(selected_results),
    )
    return WalkForwardExecution(result=result, trials=all_trials)
