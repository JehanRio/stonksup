# Phase 1: Market Data And Persistent Backtests

Status: implemented on 2026-07-29

## Objective

Replace the strategy lab's synthetic-only execution path with a provider-backed,
auditable market-data pipeline while preserving a deterministic demo mode.

## Runtime Flow

```text
Natural-language prompt
  -> deterministic strategy compiler
  -> strategy contract review
  -> demo or real data selection
  -> persisted OHLCV bars
  -> deterministic next-open backtest
  -> strategy, run, metrics, and trades persisted
  -> recent-run history in the strategy lab
```

## Data Source

- Provider adapter: Twelve Data
- Endpoint: `time_series`
- Phase 1 interval: daily (`1day`)
- Storage timeframe: `1d`
- Price adjustment: raw
- Secret: `STONKSUP_TWELVE_DATA_API_KEY`
- Maximum request size: 5,000 observations

The provider key is read by the backend only. It is never returned to the
frontend or stored in the database.

## Database

The `market_bars` table stores normalized OHLCV data by instrument, timeframe,
trading date, and source. The unique constraint makes repeated synchronization
idempotent.

Existing persistence models are now active:

- `strategies`: natural-language prompt and compiled strategy contract
- `backtest_runs`: data source, execution/data config, metrics, and run state
- `backtest_trades`: entry, exit, quantity, P&L, return, and exit reason

Migration: `20260729_0002_market_bars`

## API

```text
GET  /api/v1/market-data/capabilities
POST /api/v1/market-data/sync
GET  /api/v1/market-data/bars/{symbol}
POST /api/v1/backtests/run
POST /api/v1/backtests/compile-and-run
GET  /api/v1/backtests/runs
```

Backtest requests accept a `data` object:

```json
{
  "mode": "real",
  "provider": "twelvedata",
  "start_date": "2021-01-01",
  "end_date": "2026-07-29",
  "refresh": false
}
```

Real mode reads persisted bars first. It calls the provider only when the
requested range has fewer than 120 bars or when `refresh` is enabled.

## Known Limits

- Daily US equities only in Phase 1.
- Raw prices are not adjusted for splits or dividends yet.
- No benchmark-specific data series yet; buy-and-hold uses the selected symbol.
- No point-in-time universe or survivorship-bias control yet.
- Real mode requires a Twelve Data API key on the server.

## Server Configuration

Add the following line to `/root/workspace/stonksup/.env.runtime`:

```bash
STONKSUP_TWELVE_DATA_API_KEY=replace_with_server_side_key
```

Then deploy with:

```bash
stonksup-deploy
```

The deploy runs the Alembic migration before the backend becomes healthy.
