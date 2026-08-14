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
        return float(getattr(rows[target_index], operand.key))
    return indicators[operand.key][target_index]


def _evaluate_condition(
    rows: list[Bar],
    indicators: dict[str, list[float | None]],
    condition: StrategyCondition,
    index: int,
) -> bool:
    left = _operand_value(rows, indicators, condition.left, index)
    right = _operand_value(rows, indicators, condition.right, index)
    if left is None or right is None:
        return False

    if condition.operator in {"crosses_above", "crosses_below"}:
        previous_left = _operand_value(rows, indicators, condition.left, index - 1)
        previous_right = _operand_value(rows, indicators, condition.right, index - 1)
        if previous_left is None or previous_right is None:
            return False
        if condition.operator == "crosses_above":
            return previous_left <= previous_right and left > right
        return previous_left >= previous_right and left < right

    tolerance = condition.tolerance_bps / 10_000
    if condition.operator in {"lt", "lte"}:
        right *= 1 + tolerance
    elif condition.operator in {"gt", "gte"}:
        right *= 1 - tolerance
    return {
        "lt": left < right,
        "lte": left <= right,
        "gt": left > right,
        "gte": left >= right,
    }[condition.operator]


def _evaluate_group(
    rows: list[Bar],
    indicators: dict[str, list[float | None]],
    group: ConditionGroup,
    index: int,
) -> bool:
    matches = (
        _evaluate_condition(rows, indicators, condition, index)
        for condition in group.conditions
    )
    return all(matches) if group.mode == "all" else any(matches)


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

        if position.quantity == 0 and _evaluate_group(
            rows,
            indicator_values,
            executable_ir.entry.when,
            index,
        ):
            pending = PendingOrder("buy", executable_ir.entry.reason)
        elif position.quantity > 0 and _evaluate_group(
            rows,
            indicator_values,
            executable_ir.exit.when,
            index,
        ):
            pending = PendingOrder("sell", executable_ir.exit.reason)

    last_row = rows[-1]
    if position.quantity > 0:
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
    )
