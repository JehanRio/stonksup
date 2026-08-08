from __future__ import annotations

import hashlib
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from statistics import mean, stdev

from app.schemas.backtests import BacktestConfig, BacktestResult, StrategyKind, StrategySpec
from app.schemas.walk_forward import (
    ParameterSurfacePoint,
    ValidationMetrics,
    WalkForwardAggregate,
    WalkForwardConfig,
    WalkForwardCurvePoint,
    WalkForwardResult,
    WalkForwardWindowResult,
)
from app.services.backtest_analysis import enrich_backtest_result
from app.services.backtest_data import LoadedBacktestData
from app.services.backtest_engine import run_backtest


ENGINE_NAME = "stonksup-walk-forward.v1"


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


def _primary_parameter(strategy: StrategySpec) -> str:
    return {
        StrategyKind.EMA_PULLBACK: "ema_period",
        StrategyKind.MA_CROSSOVER: "fast_period",
        StrategyKind.MOMENTUM_BREAKOUT: "lookback_period",
        StrategyKind.RSI_MEAN_REVERSION: "rsi_period",
    }[strategy.kind]


def _stop_values(start: float, end: float, step: float) -> list[float]:
    count = math.floor((end - start) / step + 1e-9)
    return [round(start + index * step, 6) for index in range(count + 1)]


def _candidate_strategy(
    strategy: StrategySpec,
    parameter: str,
    period: int,
    stop_loss: float,
) -> StrategySpec | None:
    try:
        return StrategySpec.model_validate(
            {
                **strategy.model_dump(),
                parameter: period,
                "stop_loss_percent": stop_loss,
            }
        )
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
) -> WalkForwardAggregate:
    strategy_values = [point.strategy for point in curve]
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
    max_drawdown = min(point.drawdown for point in curve)
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
) -> WalkForwardExecution:
    rows = loaded.rows
    required = validation.train_bars + validation.test_bars * 2
    if len(rows) < required:
        raise ValueError(
            "Walk-forward requires at least "
            f"{required} bars for one parameter-selection window and two test windows"
        )

    search = validation.search
    parameter = _primary_parameter(strategy)
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
                candidate_strategy = _candidate_strategy(
                    strategy,
                    parameter,
                    period,
                    stop_loss,
                )
                if candidate_strategy is None:
                    continue
                candidate_result = enrich_backtest_result(
                    run_backtest(train_rows, candidate_strategy, config),
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
        selected_strategy = _candidate_strategy(
            strategy,
            parameter,
            selected.period,
            selected.stop_loss,
        )
        assert selected_strategy is not None

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
                selected_strategy,
                config,
                trade_start_date=test_rows[0].trading_date,
            ),
            test_loaded,
            config,
        )
        selected_results.append(test_result)
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
                primary_parameter=parameter,
                selected_period=selected.period,
                selected_stop_loss=selected.stop_loss,
                objective_score=selected.score,
                robust_score=selected.robust_score,
                candidate_count=len(candidates),
                eligible_count=len(eligible),
                used_fallback=used_fallback,
                train=_metrics(selected.result),
                test=_metrics(test_result),
            )
        )
        test_cursor += validation.test_bars
        sequence += 1

    strategy_capital = config.initial_capital
    asset_capital = config.initial_capital
    benchmark_capital = config.initial_capital
    peak = config.initial_capital
    curve: list[WalkForwardCurvePoint] = []
    trade_count = 0
    winning_trades = 0
    for window, result in zip(windows, selected_results, strict=True):
        benchmark_by_date = {point.date: point.value for point in result.benchmark_curve}
        for point in result.equity_curve:
            strategy_value = strategy_capital * point.strategy / config.initial_capital
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
        asset_capital = curve[-1].asset
        if curve[-1].benchmark is not None:
            benchmark_capital = curve[-1].benchmark
        trade_count += result.trade_count
        winning_trades += sum(1 for trade in result.trades if trade.pnl > 0)

    stability = max(selected_counts.values()) / len(windows)
    aggregate = _aggregate_metrics(
        curve,
        config,
        trade_count,
        winning_trades,
        stability,
    )
    risk, average_train, average_test, warnings = _overfitting_diagnostics(
        windows,
        search.objective,
        aggregate,
    )
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
        primary_parameter=parameter,
        train_bars=validation.train_bars,
        test_bars=validation.test_bars,
        window_count=len(windows),
        candidate_count=len(all_trials),
        overfitting_risk=risk,
        aggregate=aggregate,
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
            "参数稳定性和过拟合风险属于研究诊断，不构成统计显著性证明。",
            *loaded.assumptions,
        ],
        audit=[
            "PASS: every parameter-selection interval ends before its test interval begins.",
            "PASS: test bars never participate in parameter selection.",
            "PASS: selected parameters remain frozen throughout each test window.",
            "PASS: all candidate trials use the same cost and execution assumptions.",
            "PASS: identical configuration and OHLCV fingerprints produce the same experiment ID.",
            *loaded.audit,
            *loaded.quality.checks,
        ],
        data_quality=loaded.quality,
    )
    return WalkForwardExecution(result=result, trials=all_trials)
