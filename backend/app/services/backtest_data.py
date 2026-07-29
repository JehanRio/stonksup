from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import StonksUpError
from app.schemas.backtests import (
    BacktestDataConfig,
    BacktestResult,
    DataQualityReport,
    StrategySpec,
)
from app.schemas.market_data import MarketDataSyncRequest, PriceAdjustment
from app.services.backtest_engine import Bar, DATA_SOURCE, create_seeded_daily_history
from app.services.market_data import (
    get_daily_bar_models,
    sync_daily_bars,
    twelve_data_source,
)


@dataclass(frozen=True)
class LoadedBacktestData:
    rows: list[Bar]
    benchmark_rows: list[Bar]
    benchmark_symbol: str
    source: str
    benchmark_source: str
    adjustment: PriceAdjustment
    quality: DataQualityReport
    assumptions: list[str]
    audit: list[str]


def _to_engine_bars(rows) -> list[Bar]:
    return [
        Bar(
            trading_date=row.trading_date,
            open=float(row.open),
            high=float(row.high),
            low=float(row.low),
            close=float(row.close),
            volume=row.volume,
        )
        for row in rows
    ]


def _quality_report(
    strategy_rows: list[Bar],
    benchmark_rows: list[Bar],
    adjustment: PriceAdjustment,
) -> DataQualityReport:
    strategy_dates = [row.trading_date for row in strategy_rows]
    benchmark_dates = {row.trading_date for row in benchmark_rows}
    duplicate_count = len(strategy_dates) - len(set(strategy_dates))
    invalid_ohlc = sum(
        1
        for row in strategy_rows
        if (
            min(row.open, row.high, row.low, row.close) <= 0
            or row.high < max(row.open, row.close)
            or row.low > min(row.open, row.close)
            or row.volume < 0
        )
    )
    aligned = sum(1 for trading_date in strategy_dates if trading_date in benchmark_dates)
    alignment_ratio = aligned / len(strategy_rows) if strategy_rows else 0
    checks = [
        (
            "PASS: strategy bars are unique and ordered."
            if duplicate_count == 0
            else f"WARN: found {duplicate_count} duplicate strategy dates."
        ),
        (
            "PASS: OHLCV values satisfy basic price and volume constraints."
            if invalid_ohlc == 0
            else f"WARN: found {invalid_ohlc} malformed OHLCV bars."
        ),
        (
            f"PASS: {alignment_ratio:.1%} of strategy sessions align with the benchmark."
            if alignment_ratio >= 0.95
            else f"WARN: only {alignment_ratio:.1%} of sessions align with the benchmark."
        ),
        (
            "PASS: prices use split and dividend adjustment."
            if adjustment == "all"
            else f"WARN: price adjustment mode is {adjustment}."
        ),
    ]
    status = "pass" if all(item.startswith("PASS") for item in checks) else "warn"
    return DataQualityReport(
        status=status,
        adjustment=adjustment,
        strategy_bars=len(strategy_rows),
        benchmark_bars=len(benchmark_rows),
        aligned_bars=aligned,
        checks=checks,
    )


def _load_real_symbol(
    session: Session,
    settings: Settings,
    *,
    symbol: str,
    data: BacktestDataConfig,
) -> list[Bar]:
    rows = get_daily_bar_models(
        session,
        symbol,
        data.start_date,
        data.end_date,
        data.adjustment,
    )
    if data.refresh or len(rows) < 120:
        sync_daily_bars(
            session,
            settings,
            MarketDataSyncRequest(
                symbol=symbol,
                start_date=data.start_date,
                end_date=data.end_date,
                provider=data.provider,
                adjustment=data.adjustment,
                force=data.refresh,
            ),
        )
        rows = get_daily_bar_models(
            session,
            symbol,
            data.start_date,
            data.end_date,
            data.adjustment,
        )
    if len(rows) < 120:
        raise StonksUpError(
            "insufficient_market_data",
            "At least 120 persisted daily bars are required for this backtest.",
            status_code=422,
            details={"symbol": symbol, "available_bars": len(rows)},
        )
    return _to_engine_bars(rows)


def load_backtest_data(
    session: Session,
    settings: Settings,
    strategy: StrategySpec,
    data: BacktestDataConfig,
    demo_bars: int,
) -> LoadedBacktestData:
    benchmark_symbol = data.benchmark_symbol.strip().upper()
    if data.mode == "demo":
        rows = create_seeded_daily_history(strategy.symbol, demo_bars)
        benchmark_rows = (
            rows
            if benchmark_symbol == strategy.symbol
            else create_seeded_daily_history(benchmark_symbol, demo_bars)
        )
        quality = _quality_report(rows, benchmark_rows, "none")
        return LoadedBacktestData(
            rows=rows,
            benchmark_rows=benchmark_rows,
            benchmark_symbol=benchmark_symbol,
            source=DATA_SOURCE,
            benchmark_source=f"{DATA_SOURCE}:{benchmark_symbol}",
            adjustment="none",
            quality=quality,
            assumptions=[
                "Seeded demo data is deterministic and must not be treated as investable evidence."
            ],
            audit=[
                "LIMIT: this run uses synthetic daily data; out-of-sample validation is not enabled yet."
            ],
        )

    rows = _load_real_symbol(
        session,
        settings,
        symbol=strategy.symbol,
        data=data,
    )
    benchmark_rows = (
        rows
        if benchmark_symbol == strategy.symbol
        else _load_real_symbol(
            session,
            settings,
            symbol=benchmark_symbol,
            data=data,
        )
    )
    quality = _quality_report(rows, benchmark_rows, data.adjustment)
    source = twelve_data_source(data.adjustment)
    return LoadedBacktestData(
        rows=rows,
        benchmark_rows=benchmark_rows,
        benchmark_symbol=benchmark_symbol,
        source=source,
        benchmark_source=source,
        adjustment=data.adjustment,
        quality=quality,
        assumptions=[
            (
                "Daily OHLCV is read from persisted Twelve Data observations "
                f"with adjustment={data.adjustment}."
            ),
            f"The independent benchmark is {benchmark_symbol}.",
        ],
        audit=[
            "PASS: persisted provider bars are ordered by trading date.",
            (
                "PASS: benchmark performance is calculated from an independently "
                "persisted price series."
            ),
            "LIMIT: point-in-time universe and survivorship-bias controls are not enabled yet.",
        ],
    )


def apply_data_provenance(
    result: BacktestResult,
    loaded: LoadedBacktestData,
) -> BacktestResult:
    source_hash = hashlib.sha256(
        (
            f"{result.run_id}|{loaded.source}|{loaded.benchmark_symbol}|"
            f"{loaded.benchmark_source}|{loaded.adjustment}"
        ).encode()
    ).hexdigest()[:12].upper()
    return result.model_copy(
        update={
            "run_id": f"BT-{source_hash}",
            "data_source": loaded.source,
            "benchmark_source": loaded.benchmark_source,
            "benchmark_symbol": loaded.benchmark_symbol,
            "adjustment": loaded.adjustment,
            "data_quality": loaded.quality,
            "assumptions": [*result.assumptions[:3], *loaded.assumptions],
            "audit": [*result.audit[:3], *loaded.audit, *loaded.quality.checks],
        }
    )
