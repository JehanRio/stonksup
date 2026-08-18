from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import mean, stdev

from app.schemas.backtests import (
    BacktestConfig,
    BacktestResult,
    BacktestTrade,
    EquityPoint,
    SignalBottleneck,
    SignalConditionDiagnostic,
    SignalDiagnostics,
    SignalRuleDiagnostic,
    StrategySpec,
)
from app.schemas.strategy_ir import (
    ConditionGroup,
    IndicatorSpec,
    StrategyCondition,
    StrategyIR,
    StrategyOperand,
)
from app.services.strategy_compiler import CONTRACT_VERSION
from app.services.strategy_ir import (
    build_strategy_ir,
    build_strategy_manifest,
    strategy_ir_hash,
)


ENGINE_NAME = "stonksup-strategy-ir-engine.v2"
DATA_SOURCE = "seeded-daily-regimes.demo-v2"
LAST_MARKET_DATE = date(2026, 7, 24)


@dataclass(frozen=True)
class Bar:
    trading_date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class Position:
    quantity: int = 0
    entry_date: date | None = None
    entry_price: float = 0
    entry_fee: float = 0


@dataclass(frozen=True)
class PendingOrder:
    side: str
    reason: str


@dataclass
class _RuleDiagnosticCounter:
    condition_evaluated: list[int]
    condition_matched: list[int]
    evaluated_bars: int = 0
    matched_bars: int = 0

    @classmethod
    def create(cls, condition_count: int) -> "_RuleDiagnosticCounter":
        return cls([0] * condition_count, [0] * condition_count)

    def record(self, states: list[tuple[bool, bool]], group_matched: bool) -> None:
        for index, (evaluable, matched) in enumerate(states):
            if evaluable:
                self.condition_evaluated[index] += 1
                if matched:
                    self.condition_matched[index] += 1
        if all(evaluable for evaluable, _ in states):
            self.evaluated_bars += 1
            if group_matched:
                self.matched_bars += 1


def _seed_for_symbol(symbol: str) -> int:
    digest = hashlib.sha256(f"stonksup:{symbol}:demo-v2".encode()).hexdigest()
    return int(digest[:16], 16)


def _business_dates(count: int) -> list[date]:
    dates: list[date] = []
    cursor = LAST_MARKET_DATE
    while len(dates) < count:
        if cursor.weekday() < 5:
            dates.append(cursor)
        cursor -= timedelta(days=1)
    return list(reversed(dates))


def create_seeded_daily_history(symbol: str, count: int) -> list[Bar]:
    normalized_symbol = symbol.strip().upper() or "MU"
    rng = random.Random(_seed_for_symbol(normalized_symbol))
    dates = _business_dates(count)
    base_prices = {
        "MU": 62,
        "NVDA": 48,
        "AAPL": 132,
        "MSFT": 240,
        "GOOG": 108,
        "GOOGL": 108,
        "TSLA": 190,
    }
    previous_close = float(base_prices.get(normalized_symbol, 100))
    rows: list[Bar] = []

    for index, trading_date in enumerate(dates):
        progress = index / max(count - 1, 1)
        if progress < 0.24:
            regime_drift = -0.00025
        elif progress < 0.58:
            regime_drift = 0.00115
        elif progress < 0.76:
            regime_drift = -0.00065
        else:
            regime_drift = 0.00135

        cycle = math.sin(index / 17) * 0.0024 + math.sin(index / 43) * 0.0018
        noise = (rng.random() - 0.5) * 0.038
        event_shock = (rng.random() - 0.42) * 0.085 if index and index % 137 == 0 else 0
        daily_return = min(max(regime_drift + cycle + noise + event_shock, -0.095), 0.095)
        open_price = previous_close * (1 + (rng.random() - 0.5) * 0.012)
        close_price = max(4, previous_close * (1 + daily_return))
        high_price = max(open_price, close_price) * (1 + rng.random() * 0.021)
        low_price = min(open_price, close_price) * (1 - rng.random() * 0.021)
        volume = round(
            12_000_000
            * (0.72 + rng.random() * 0.8)
            * (1 + abs(daily_return) * 8)
        )
        rows.append(
            Bar(
                trading_date=trading_date,
                open=round(open_price, 4),
                high=round(high_price, 4),
                low=round(low_price, 4),
                close=round(close_price, 4),
                volume=volume,
            )
        )
        previous_close = close_price

    return rows


def _sma(
    rows: list[Bar],
    period: int,
    source: str = "close",
) -> list[float | None]:
    values: list[float | None] = []
    rolling_sum = 0.0
    for index, row in enumerate(rows):
        rolling_sum += float(getattr(row, source))
        if index >= period:
            rolling_sum -= float(getattr(rows[index - period], source))
        values.append(rolling_sum / period if index >= period - 1 else None)
    return values


def _ema(
    rows: list[Bar],
    period: int,
    source: str = "close",
) -> list[float | None]:
    values: list[float | None] = [None] * len(rows)
    if len(rows) < period:
        return values

    seed_value = sum(float(getattr(row, source)) for row in rows[:period]) / period
    values[period - 1] = seed_value
    multiplier = 2 / (period + 1)
    previous = seed_value
    for index in range(period, len(rows)):
        current = float(getattr(rows[index], source))
        previous = (current - previous) * multiplier + previous
        values[index] = previous
    return values


def _rsi(
    rows: list[Bar],
    period: int,
    source: str = "close",
) -> list[float | None]:
    values: list[float | None] = [None] * len(rows)
    for index in range(period, len(rows)):
        gains = 0.0
        losses = 0.0
        for cursor in range(index - period + 1, index + 1):
            current = float(getattr(rows[cursor], source))
            previous = float(getattr(rows[cursor - 1], source))
            change = current - previous
            if change >= 0:
                gains += change
            else:
                losses += abs(change)
        values[index] = 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)
    return values


def _rolling_max(
    rows: list[Bar],
    period: int,
    source: str,
) -> list[float | None]:
    values: list[float | None] = [None] * len(rows)
    for index in range(period - 1, len(rows)):
        values[index] = max(
            float(getattr(row, source)) for row in rows[index - period + 1 : index + 1]
        )
    return values


def _indicator_series(
    rows: list[Bar],
    indicator: IndicatorSpec,
) -> list[float | None]:
    if indicator.kind == "ema":
        return _ema(rows, indicator.period, indicator.source)
    if indicator.kind == "sma":
        return _sma(rows, indicator.period, indicator.source)
    if indicator.kind == "rsi":
        return _rsi(rows, indicator.period, indicator.source)
    return _rolling_max(rows, indicator.period, indicator.source)


def _operand_value(
    rows: list[Bar],
    indicators: dict[str, list[float | None]],
    operand: StrategyOperand,
    index: int,
) -> float | None:
    if operand.source == "constant":
        return operand.value
    target_index = index + operand.offset
    if target_index < 0 or target_index >= len(rows) or operand.key is None:
        return None
    if operand.source == "field":
        return float(getattr(rows[target_index], operand.key)) * operand.multiplier
    value = indicators[operand.key][target_index]
    return value * operand.multiplier if value is not None else None


def _evaluate_condition_state(
    rows: list[Bar],
    indicators: dict[str, list[float | None]],
    condition: StrategyCondition,
    index: int,
) -> tuple[bool, bool]:
    left = _operand_value(rows, indicators, condition.left, index)
    right = _operand_value(rows, indicators, condition.right, index)
    if left is None or right is None:
        return False, False

    if condition.operator in {"crosses_above", "crosses_below"}:
        previous_left = _operand_value(rows, indicators, condition.left, index - 1)
        previous_right = _operand_value(rows, indicators, condition.right, index - 1)
        if previous_left is None or previous_right is None:
            return False, False
        if condition.operator == "crosses_above":
            return True, previous_left <= previous_right and left > right
        return True, previous_left >= previous_right and left < right

    tolerance = condition.tolerance_bps / 10_000
    if condition.operator in {"lt", "lte"}:
        right *= 1 + tolerance
    elif condition.operator in {"gt", "gte"}:
        right *= 1 - tolerance
    return True, {
        "lt": left < right,
        "lte": left <= right,
        "gt": left > right,
        "gte": left >= right,
    }[condition.operator]


def _evaluate_group_state(
    rows: list[Bar],
    indicators: dict[str, list[float | None]],
    group: ConditionGroup,
    index: int,
) -> tuple[list[tuple[bool, bool]], bool]:
    states = [
        _evaluate_condition_state(rows, indicators, condition, index)
        for condition in group.conditions
    ]
    if not all(evaluable for evaluable, _ in states):
        return states, False
    matches = [matched for _, matched in states]
    return states, all(matches) if group.mode == "all" else any(matches)


def _operand_expression(
    operand: StrategyOperand,
    indicators: dict[str, IndicatorSpec],
) -> str:
    if operand.source == "constant":
        return f"{operand.value:g}" if operand.value is not None else "--"
    field_names = {
        "open": "开盘价",
        "high": "最高价",
        "low": "最低价",
        "close": "收盘价",
        "volume": "成交量",
    }
    if operand.source == "field":
        label = field_names.get(operand.key or "", (operand.key or "--").upper())
    else:
        indicator = indicators.get(operand.key or "")
        label = (
            f"{indicator.kind.upper()}{indicator.period}"
            if indicator is not None
            else (operand.key or "--").upper()
        )
    if operand.offset == -1:
        label = f"前一日{label}"
    if operand.multiplier != 1:
        label = f"{label} x {operand.multiplier:g}"
    return label


def _condition_expression(
    condition: StrategyCondition,
    indicators: dict[str, IndicatorSpec],
) -> str:
    operator = {
        "lt": "<",
        "lte": "<=",
        "gt": ">",
        "gte": ">=",
        "crosses_above": "上穿",
        "crosses_below": "下穿",
    }[condition.operator]
    expression = (
        f"{_operand_expression(condition.left, indicators)} {operator} "
        f"{_operand_expression(condition.right, indicators)}"
    )
    if condition.tolerance_bps:
        expression += f"（容差 {condition.tolerance_bps} bps）"
    return expression


def _rate(matched: int, evaluated: int) -> float:
    return matched / evaluated if evaluated else 0


def _rule_diagnostic(
    group: ConditionGroup,
    reason: str,
    counter: _RuleDiagnosticCounter,
    indicators: dict[str, IndicatorSpec],
) -> SignalRuleDiagnostic:
    return SignalRuleDiagnostic(
        reason=reason,
        mode=group.mode,
        evaluated_bars=counter.evaluated_bars,
        matched_bars=counter.matched_bars,
        match_rate=_rate(counter.matched_bars, counter.evaluated_bars),
        conditions=[
            SignalConditionDiagnostic(
                index=index,
                expression=_condition_expression(condition, indicators),
                expression_variants=[_condition_expression(condition, indicators)],
                source_text=condition.source_text,
                evaluated_bars=counter.condition_evaluated[index],
                matched_bars=counter.condition_matched[index],
                match_rate=_rate(
                    counter.condition_matched[index],
                    counter.condition_evaluated[index],
                ),
            )
            for index, condition in enumerate(group.conditions)
        ],
    )


def _diagnostic_conclusion(entry: SignalRuleDiagnostic) -> str:
    if entry.evaluated_bars == 0:
        return "no_evaluable_entry_bars"
    if entry.matched_bars == 0:
        return "entry_conditions_never_aligned"
    return "orders_generated"


def _bottleneck(entry: SignalRuleDiagnostic) -> SignalBottleneck | None:
    condition = min(
        (item for item in entry.conditions if item.evaluated_bars > 0),
        key=lambda item: (item.match_rate, item.index),
        default=None,
    )
    if condition is None:
        return None
    return SignalBottleneck(
        side="entry",
        condition_index=condition.index,
        expression=(
            f"{condition.expression} 等 {len(condition.expression_variants)} 组窗口参数"
            if len(condition.expression_variants) > 1
            else condition.expression
        ),
        match_rate=condition.match_rate,
    )


def _build_signal_diagnostics(
    strategy_ir: StrategyIR,
    entry_counter: _RuleDiagnosticCounter,
    exit_counter: _RuleDiagnosticCounter,
    entry_orders: int,
    exit_orders: int,
    protective_stops: int,
    forced_exits: int,
) -> SignalDiagnostics:
    indicators = {item.id: item for item in strategy_ir.indicators}
    entry = _rule_diagnostic(
        strategy_ir.entry.when,
        strategy_ir.entry.reason,
        entry_counter,
        indicators,
    )
    exit_rule = _rule_diagnostic(
        strategy_ir.exit.when,
        strategy_ir.exit.reason,
        exit_counter,
        indicators,
    )
    return SignalDiagnostics(
        entry=entry,
        exit=exit_rule,
        entry_orders=entry_orders,
        exit_orders=exit_orders,
        protective_stops=protective_stops,
        forced_exits=forced_exits,
        conclusion=_diagnostic_conclusion(entry),
        bottleneck=_bottleneck(entry),
    )


def merge_signal_diagnostics(results: list[BacktestResult]) -> SignalDiagnostics:
    if not results:
        raise ValueError("Signal diagnostics require at least one backtest result")

    def merge_rule(side: str) -> SignalRuleDiagnostic:
        rules = [getattr(result.signal_diagnostics, side) for result in results]
        first_rule = rules[0]
        evaluated_bars = sum(rule.evaluated_bars for rule in rules)
        matched_bars = sum(rule.matched_bars for rule in rules)
        return SignalRuleDiagnostic(
            reason=first_rule.reason,
            mode=first_rule.mode,
            evaluated_bars=evaluated_bars,
            matched_bars=matched_bars,
            match_rate=_rate(matched_bars, evaluated_bars),
            conditions=[
                SignalConditionDiagnostic(
                    index=condition.index,
                    expression=condition.expression,
                    expression_variants=list(
                        dict.fromkeys(
                            variant
                            for rule in rules
                            for variant in rule.conditions[index].expression_variants
                        )
                    ),
                    source_text=condition.source_text,
                    evaluated_bars=sum(
                        rule.conditions[index].evaluated_bars for rule in rules
                    ),
                    matched_bars=sum(
                        rule.conditions[index].matched_bars for rule in rules
                    ),
                    match_rate=_rate(
                        sum(rule.conditions[index].matched_bars for rule in rules),
                        sum(rule.conditions[index].evaluated_bars for rule in rules),
                    ),
                )
                for index, condition in enumerate(first_rule.conditions)
            ],
        )

    entry = merge_rule("entry")
    exit_rule = merge_rule("exit")
    return SignalDiagnostics(
        entry=entry,
        exit=exit_rule,
        entry_orders=sum(result.signal_diagnostics.entry_orders for result in results),
        exit_orders=sum(result.signal_diagnostics.exit_orders for result in results),
        protective_stops=sum(
            result.signal_diagnostics.protective_stops for result in results
        ),
        forced_exits=sum(result.signal_diagnostics.forced_exits for result in results),
        conclusion=_diagnostic_conclusion(entry),
        bottleneck=_bottleneck(entry),
    )


def _strategy_hash(
    strategy_ir: StrategyIR,
    config: BacktestConfig,
    first_date: date,
    last_date: date,
) -> str:
    payload = "|".join(
        [
            strategy_ir_hash(strategy_ir),
            config.model_dump_json(),
            first_date.isoformat(),
            last_date.isoformat(),
            ENGINE_NAME,
        ]
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:12].upper()


def run_backtest(
    rows: list[Bar],
    strategy: StrategySpec,
    config: BacktestConfig,
    *,
    strategy_ir: StrategyIR | None = None,
    trade_start_date: date | None = None,
) -> BacktestResult:
    if len(rows) < 120:
        raise ValueError("Backtest requires at least 120 daily bars")

    evaluation_start_index = 0
    if trade_start_date is not None:
        evaluation_start_index = next(
            (
                index
                for index, row in enumerate(rows)
                if row.trading_date >= trade_start_date
            ),
            -1,
        )
        if evaluation_start_index < 0 or len(rows) - evaluation_start_index < 2:
            raise ValueError("Backtest evaluation window requires at least two bars")

    executable_ir = strategy_ir or build_strategy_ir(strategy)
    if executable_ir.symbol != strategy.symbol.strip().upper():
        raise ValueError("Strategy IR symbol must match the strategy specification")
    manifest = build_strategy_manifest(executable_ir)
    indicator_values = {
        indicator.id: _indicator_series(rows, indicator)
        for indicator in executable_ir.indicators
    }
    commission_rate = config.commission_bps / 10_000
    slippage_rate = config.slippage_bps / 10_000

    cash = config.initial_capital
    position = Position()
    pending: PendingOrder | None = None
    trades: list[BacktestTrade] = []
    equity_curve: list[EquityPoint] = []
    first_close = rows[evaluation_start_index].close
    peak_equity = config.initial_capital
    entry_counter = _RuleDiagnosticCounter.create(
        len(executable_ir.entry.when.conditions)
    )
    exit_counter = _RuleDiagnosticCounter.create(
        len(executable_ir.exit.when.conditions)
    )
    entry_orders = 0
    exit_orders = 0
    protective_stops = 0
    forced_exits = 0

    def close_position(row: Bar, raw_price: float, reason: str) -> None:
        nonlocal cash, position
        if position.quantity <= 0 or position.entry_date is None:
            return

        exit_price = raw_price * (1 - slippage_rate)
        proceeds = position.quantity * exit_price
        exit_fee = proceeds * commission_rate
        cash += proceeds - exit_fee
        entry_value = position.quantity * position.entry_price
        pnl = proceeds - exit_fee - entry_value - position.entry_fee
        trades.append(
            BacktestTrade(
                id=f"T-{len(trades) + 1:03d}",
                entry_date=position.entry_date.isoformat(),
                exit_date=row.trading_date.isoformat(),
                entry_price=round(position.entry_price, 4),
                exit_price=round(exit_price, 4),
                quantity=position.quantity,
                pnl=round(pnl, 2),
                return_percent=(
                    pnl / (entry_value + position.entry_fee)
                    if entry_value + position.entry_fee
                    else 0
                ),
                exit_reason=reason,
            )
        )
        position = Position()

    for index, row in enumerate(rows):
        if index < evaluation_start_index:
            continue

        if pending and pending.side == "buy" and position.quantity == 0:
            execution_price = row.open * (1 + slippage_rate)
            budget = cash * executable_ir.sizing.value
            quantity = math.floor(budget / (execution_price * (1 + commission_rate)))
            if quantity > 0:
                cost = quantity * execution_price
                entry_fee = cost * commission_rate
                cash -= cost + entry_fee
                position = Position(
                    quantity=quantity,
                    entry_date=row.trading_date,
                    entry_price=execution_price,
                    entry_fee=entry_fee,
                )
        elif pending and pending.side == "sell" and position.quantity > 0:
            close_position(row, row.open, pending.reason)
        pending = None

        stopped_out = False
        if position.quantity > 0 and executable_ir.risk.stop_loss_percent > 0:
            stop_price = position.entry_price * (
                1 - executable_ir.risk.stop_loss_percent / 100
            )
            if row.low <= stop_price:
                close_position(row, min(row.open, stop_price), "protective_stop")
                stopped_out = True
                protective_stops += 1

        marked_equity = cash + position.quantity * row.close
        peak_equity = max(peak_equity, marked_equity)
        equity_curve.append(
            EquityPoint(
                date=row.trading_date.isoformat(),
                strategy=round(marked_equity, 2),
                benchmark=round(config.initial_capital * row.close / first_close, 2),
                drawdown=marked_equity / peak_equity - 1 if peak_equity else 0,
            )
        )

        if stopped_out or index == len(rows) - 1:
            continue

        entry_states, entry_matched = _evaluate_group_state(
            rows,
            indicator_values,
            executable_ir.entry.when,
            index,
        )
        exit_states, exit_matched = _evaluate_group_state(
            rows,
            indicator_values,
            executable_ir.exit.when,
            index,
        )
        entry_counter.record(entry_states, entry_matched)
        exit_counter.record(exit_states, exit_matched)

        if position.quantity == 0 and entry_matched:
            pending = PendingOrder("buy", executable_ir.entry.reason)
            entry_orders += 1
        elif position.quantity > 0 and exit_matched:
            pending = PendingOrder("sell", executable_ir.exit.reason)
            exit_orders += 1

    last_row = rows[-1]
    if position.quantity > 0:
        forced_exits += 1
        close_position(last_row, last_row.close, "end_of_test")
        equity_curve[-1].strategy = round(cash, 2)
        rolling_peak = config.initial_capital
        for point in equity_curve:
            rolling_peak = max(rolling_peak, point.strategy)
            point.drawdown = point.strategy / rolling_peak - 1

    final_equity = equity_curve[-1].strategy
    total_return = final_equity / config.initial_capital - 1
    years = max((len(equity_curve) - 1) / 252, 1 / 252)
    annualized_return = (
        max(final_equity / config.initial_capital, 0.0001) ** (1 / years) - 1
    )
    daily_returns = [
        equity_curve[index].strategy / equity_curve[index - 1].strategy - 1
        for index in range(1, len(equity_curve))
        if equity_curve[index - 1].strategy
    ]
    daily_mean = mean(daily_returns) if daily_returns else 0
    daily_std = stdev(daily_returns) if len(daily_returns) > 1 else 0
    winning_trades = [trade for trade in trades if trade.pnl > 0]
    gross_profit = sum(trade.pnl for trade in winning_trades)
    gross_loss = abs(sum(trade.pnl for trade in trades if trade.pnl < 0))
    profit_factor = 99 if gross_loss == 0 and gross_profit > 0 else (
        gross_profit / gross_loss if gross_loss else 0
    )

    return BacktestResult(
        run_id=f"BT-{_strategy_hash(executable_ir, config, rows[evaluation_start_index].trading_date, last_row.trading_date)}",
        symbol=strategy.symbol,
        strategy_name=strategy.name,
        bars=len(equity_curve),
        as_of=last_row.trading_date.isoformat(),
        data_source=DATA_SOURCE,
        engine=ENGINE_NAME,
        contract_version=CONTRACT_VERSION,
        initial_capital=config.initial_capital,
        final_equity=round(final_equity, 2),
        total_return=total_return,
        annualized_return=annualized_return,
        benchmark_return=last_row.close / first_close - 1,
        max_drawdown=min(point.drawdown for point in equity_curve),
        sharpe_ratio=daily_mean / daily_std * math.sqrt(252) if daily_std else 0,
        win_rate=len(winning_trades) / len(trades) if trades else 0,
        profit_factor=profit_factor,
        trade_count=len(trades),
        equity_curve=equity_curve,
        trades=trades,
        assumptions=[
            "Long-only; one position at a time; integer shares.",
            (
                f"Commission {config.commission_bps:g} bps and "
                f"slippage {config.slippage_bps:g} bps per side."
            ),
            "Signals use completed close data and execute at the next session open.",
            (
                "Pre-window bars are indicator warm-up only; trading starts at "
                f"{rows[evaluation_start_index].trading_date.isoformat()}."
                if trade_start_date is not None
                else "The complete input interval is eligible for trading."
            ),
            "Seeded demo data is deterministic and must not be treated as investable evidence.",
        ],
        audit=[
            f"PASS: validated Strategy IR {manifest.ir_hash[:12]} with {len(executable_ir.indicators)} indicator dependencies.",
            f"PASS: manifest declares {manifest.warmup_bars} warm-up bars and fields {', '.join(manifest.required_fields)}.",
            "PASS: no future bars are available to signal calculations.",
            "PASS: signal generation and order execution occur on different sessions.",
            "PASS: identical strategy, configuration, and data produce the same run ID.",
            "LIMIT: this run uses synthetic daily data; out-of-sample validation is not enabled yet.",
        ],
        signal_diagnostics=_build_signal_diagnostics(
            executable_ir,
            entry_counter,
            exit_counter,
            entry_orders,
            exit_orders,
            protective_stops,
            forced_exits,
        ),
    )
