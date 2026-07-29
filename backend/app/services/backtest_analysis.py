from __future__ import annotations

import math
from datetime import date
from statistics import mean, stdev

from app.schemas.backtests import BacktestConfig, BacktestResult, BenchmarkPoint
from app.services.backtest_data import LoadedBacktestData


def _daily_returns(values: list[float]) -> list[float]:
    return [
        values[index] / values[index - 1] - 1
        for index in range(1, len(values))
        if values[index - 1]
    ]


def _aligned_benchmark_curve(
    result: BacktestResult,
    loaded: LoadedBacktestData,
) -> list[BenchmarkPoint]:
    closes = {row.trading_date: row.close for row in loaded.benchmark_rows}
    ordered = sorted(loaded.benchmark_rows, key=lambda row: row.trading_date)
    cursor = 0
    last_close: float | None = None
    selected: list[tuple[str, float]] = []
    for point in result.equity_curve:
        trading_date = date.fromisoformat(point.date)
        while cursor < len(ordered) and ordered[cursor].trading_date <= trading_date:
            last_close = ordered[cursor].close
            cursor += 1
        exact_close = closes.get(trading_date)
        close = exact_close if exact_close is not None else last_close
        if close is not None:
            selected.append((point.date, close))
    if not selected:
        return []
    first_close = selected[0][1]
    return [
        BenchmarkPoint(
            date=trading_date,
            value=round(result.initial_capital * close / first_close, 2),
        )
        for trading_date, close in selected
    ]


def _alpha_beta(
    strategy_returns: list[float],
    benchmark_returns: list[float],
) -> tuple[float, float]:
    count = min(len(strategy_returns), len(benchmark_returns))
    if count < 2:
        return 0, 0
    strategy = strategy_returns[-count:]
    benchmark = benchmark_returns[-count:]
    strategy_mean = mean(strategy)
    benchmark_mean = mean(benchmark)
    benchmark_variance = sum(
        (value - benchmark_mean) ** 2 for value in benchmark
    ) / count
    if benchmark_variance == 0:
        return 0, 0
    covariance = sum(
        (strategy[index] - strategy_mean)
        * (benchmark[index] - benchmark_mean)
        for index in range(count)
    ) / count
    beta = covariance / benchmark_variance
    alpha = (strategy_mean - beta * benchmark_mean) * 252
    return alpha, beta


def enrich_backtest_result(
    result: BacktestResult,
    loaded: LoadedBacktestData,
    config: BacktestConfig,
) -> BacktestResult:
    benchmark_curve = _aligned_benchmark_curve(result, loaded)
    strategy_values = [point.strategy for point in result.equity_curve]
    benchmark_values = [point.value for point in benchmark_curve]
    strategy_returns = _daily_returns(strategy_values)
    benchmark_returns = _daily_returns(benchmark_values)

    annualized_volatility = (
        stdev(strategy_returns) * math.sqrt(252)
        if len(strategy_returns) > 1
        else 0
    )
    downside = [min(value, 0) for value in strategy_returns]
    downside_deviation = stdev(downside) if len(downside) > 1 else 0
    sortino = (
        mean(strategy_returns) / downside_deviation * math.sqrt(252)
        if downside_deviation
        else 0
    )
    calmar = (
        result.annualized_return / abs(result.max_drawdown)
        if result.max_drawdown
        else 0
    )
    alpha, beta = _alpha_beta(strategy_returns, benchmark_returns)
    benchmark_return = (
        benchmark_values[-1] / benchmark_values[0] - 1
        if len(benchmark_values) > 1 and benchmark_values[0]
        else 0
    )
    holding_days = [
        (
            date.fromisoformat(trade.exit_date)
            - date.fromisoformat(trade.entry_date)
        ).days
        for trade in result.trades
    ]
    commission_rate = config.commission_bps / 10_000
    total_commission = sum(
        (
            trade.entry_price * trade.quantity
            + trade.exit_price * trade.quantity
        )
        * commission_rate
        for trade in result.trades
    )
    asset_return = result.benchmark_return

    return result.model_copy(
        update={
            "benchmark_symbol": loaded.benchmark_symbol,
            "benchmark_source": loaded.benchmark_source,
            "adjustment": loaded.adjustment,
            "asset_return": asset_return,
            "benchmark_return": benchmark_return,
            "excess_return": result.total_return - benchmark_return,
            "annualized_volatility": annualized_volatility,
            "sortino_ratio": sortino,
            "calmar_ratio": calmar,
            "alpha": alpha,
            "beta": beta,
            "average_holding_days": mean(holding_days) if holding_days else 0,
            "total_commission": round(total_commission, 2),
            "benchmark_curve": benchmark_curve,
            "data_quality": loaded.quality,
        }
    )
