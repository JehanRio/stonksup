from __future__ import annotations

import hashlib
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import StonksUpError
from app.schemas.backtests import (
    BacktestDataConfig,
    BacktestResult,
    StrategySpec,
)
from app.schemas.market_data import MarketDataSyncRequest
from app.services.backtest_engine import Bar, DATA_SOURCE, create_seeded_daily_history
from app.services.market_data import (
    TWELVE_DATA_SOURCE,
    get_daily_bar_models,
    sync_daily_bars,
)


@dataclass(frozen=True)
class LoadedBacktestData:
    rows: list[Bar]
    source: str
    assumptions: list[str]
    audit: list[str]


def load_backtest_data(
    session: Session,
    settings: Settings,
    strategy: StrategySpec,
    data: BacktestDataConfig,
    demo_bars: int,
) -> LoadedBacktestData:
    if data.mode == "demo":
        return LoadedBacktestData(
            rows=create_seeded_daily_history(strategy.symbol, demo_bars),
            source=DATA_SOURCE,
            assumptions=[
                "Seeded demo data is deterministic and must not be treated as investable evidence."
            ],
            audit=[
                "LIMIT: this run uses synthetic daily data; out-of-sample validation is not enabled yet."
            ],
        )

    rows = get_daily_bar_models(
        session,
        strategy.symbol,
        data.start_date,
        data.end_date,
    )
    if data.refresh or len(rows) < 120:
        sync_daily_bars(
            session,
            settings,
            MarketDataSyncRequest(
                symbol=strategy.symbol,
                start_date=data.start_date,
                end_date=data.end_date,
                provider=data.provider,
                force=data.refresh,
            ),
        )
        rows = get_daily_bar_models(
            session,
            strategy.symbol,
            data.start_date,
            data.end_date,
        )
    if len(rows) < 120:
        raise StonksUpError(
            "insufficient_market_data",
            "At least 120 persisted daily bars are required for this backtest.",
            status_code=422,
            details={"symbol": strategy.symbol, "available_bars": len(rows)},
        )
    return LoadedBacktestData(
        rows=[
            Bar(
                trading_date=row.trading_date,
                open=float(row.open),
                high=float(row.high),
                low=float(row.low),
                close=float(row.close),
                volume=row.volume,
            )
            for row in rows
        ],
        source=TWELVE_DATA_SOURCE,
        assumptions=[
            "Daily OHLCV is read from persisted Twelve Data observations.",
            "Prices are raw and are not adjusted for splits or dividends in this phase.",
        ],
        audit=[
            "PASS: persisted provider bars are ordered by trading date.",
            "LIMIT: survivorship bias and corporate-action adjustment checks are not enabled yet.",
        ],
    )


def apply_data_provenance(
    result: BacktestResult,
    loaded: LoadedBacktestData,
) -> BacktestResult:
    source_hash = hashlib.sha256(
        f"{result.run_id}|{loaded.source}".encode()
    ).hexdigest()[:12].upper()
    return result.model_copy(
        update={
            "run_id": f"BT-{source_hash}",
            "data_source": loaded.source,
            "assumptions": [*result.assumptions[:3], *loaded.assumptions],
            "audit": [*result.audit[:3], *loaded.audit],
        }
    )
