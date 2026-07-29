# Phase 2: Backtest Credibility

## Goal

Phase 2 turns the first real-data backtest loop into a result that can be
compared, inspected, and explained. It adds three foundations:

1. Explicitly adjusted market data
2. An independent benchmark
3. Relative-return and risk metrics with data-quality evidence

The strategy engine remains deterministic. AI translates natural language into
a constrained strategy contract; it does not execute arbitrary generated code.

## Data Contract

Real backtests request daily bars from Twelve Data with `adjust=all`, covering
both splits and dividends. Adjustment mode is part of the stored source
identifier and run fingerprint so raw and adjusted series cannot be silently
mixed.

Every run records:

- strategy symbol and benchmark symbol
- requested date range and actual bar range
- provider, adjustment mode, and source identifiers
- strategy and benchmark bar counts
- content hash and run fingerprint
- data-quality status and issues

Demo mode remains deterministic and reports its synthetic data basis clearly.

## Benchmark Model

The default benchmark is `SPY`, selectable as `QQQ` or the current asset.
Benchmark bars are loaded independently from strategy bars, then aligned to the
strategy trading calendar. A missing benchmark session uses the latest prior
close only after the alignment quality check has been calculated.

The chart separates three concepts:

- **Strategy**: equity after signals, fills, costs, and risk rules
- **Asset buy and hold**: passive return of the traded symbol
- **Independent benchmark**: passive return of the selected benchmark

This prevents the previous asset buy-and-hold line from being mistaken for a
market benchmark.

## Metrics

The result panel includes:

- cumulative and annualized strategy return
- independent benchmark return and excess return
- maximum drawdown and annualized volatility
- Sharpe, Sortino, and Calmar ratios
- annualized Alpha and Beta versus the independent benchmark
- win rate, trade count, average holding days, and estimated commission

Alpha and Beta use aligned daily strategy and benchmark returns. Alpha is
annualized with 252 trading days. Commission is estimated from recorded entry
and exit notionals; slippage remains embedded in execution prices.

These metrics are research evidence, not a prediction or trading guarantee.

## Data-Quality Gate

Before the engine runs, the loader checks:

- no duplicate trading dates
- valid OHLC ordering and non-negative volume
- at least 95% benchmark-date alignment
- explicit fully adjusted prices in real mode

Blocking defects stop the run. Non-blocking limitations are shown as warnings
in the result panel.

## API Example

```json
{
  "prompt": "MU 日线跌到 EMA5 时买入，收盘跌破 EMA5 时卖出。",
  "data": {
    "mode": "real",
    "provider": "twelvedata",
    "adjustment": "all",
    "benchmark_symbol": "SPY",
    "start_date": "2021-01-01",
    "end_date": "2026-01-01",
    "refresh": false
  },
  "config": {
    "initial_capital": 100000,
    "commission_bps": 5,
    "slippage_bps": 5
  }
}
```

The response contains `benchmark_curve`, `data_quality`, all relative metrics,
and the Phase 1 audit fields.

## Next Phase

Phase 3 should focus on research validity rather than adding more visual
metrics:

1. walk-forward train/test windows
2. parameter sweeps with overfitting warnings
3. strategy versioning and result comparison
4. survivorship-bias-aware universes
5. risk-free rate and configurable benchmark portfolios
