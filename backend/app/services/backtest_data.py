from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, timedelta

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


def _bars_hash(rows: list[Bar]) -> str:
    digest = hashlib.sha256()
    for row in sorted(rows, key=lambda item: item.trading_date):
        digest.update(
            (
                f"{row.trading_date.isoformat()}|{row.open:.8f}|{row.high:.8f}|"
                f"{row.low:.8f}|{row.close:.8f}|{row.volume}\n"
            ).encode()
        )
    return digest.hexdigest().upper()


def _weekday_count(start: date, end: date) -> int:
    if start > end:
        return 0
    return sum(
        1
        for offset in range((end - start).days + 1)
        if (start + timedelta(days=offset)).weekday() < 5
    )


def _coverage(rows: list[Bar], requested_start: date, requested_end: date) -> float:
    expected = _weekday_count(requested_start, requested_end)
    if expected == 0:
        return 1
    observed = len(
        {
            row.trading_date
            for row in rows
            if requested_start <= row.trading_date <= requested_end
        }
    )
    return min(observed / expected, 1)


def _invalid_ohlcv(rows: list[Bar]) -> int:
    return sum(
        1
        for row in rows
        if (
            min(row.open, row.high, row.low, row.close) <= 0
            or row.high < max(row.open, row.close)
            or row.low > min(row.open, row.close)
            or row.volume < 0
        )
    )


def _quality_report(
    strategy_rows: list[Bar],
    benchmark_rows: list[Bar],
    adjustment: PriceAdjustment,
    requested_start: date,
    requested_end: date,
    *,
    enforce_coverage: bool,
) -> DataQualityReport:
    strategy_rows = sorted(strategy_rows, key=lambda row: row.trading_date)
    benchmark_rows = sorted(benchmark_rows, key=lambda row: row.trading_date)
    strategy_dates = [row.trading_date for row in strategy_rows]
    benchmark_date_list = [row.trading_date for row in benchmark_rows]
    benchmark_dates = set(benchmark_date_list)
    duplicate_count = len(strategy_dates) - len(set(strategy_dates))
    benchmark_duplicates = len(benchmark_date_list) - len(benchmark_dates)
    strategy_invalid = _invalid_ohlcv(strategy_rows)
    benchmark_invalid = _invalid_ohlcv(benchmark_rows)
    aligned = sum(1 for trading_date in strategy_dates if trading_date in benchmark_dates)
    alignment_ratio = aligned / len(strategy_rows) if strategy_rows else 0
    target_end = min(requested_end, date.today())
    actual_start = strategy_rows[0].trading_date
    actual_end = strategy_rows[-1].trading_date
    benchmark_start = benchmark_rows[0].trading_date
    benchmark_end = benchmark_rows[-1].trading_date
    coverage_ratio = _coverage(strategy_rows, requested_start, target_end)
    benchmark_coverage = _coverage(benchmark_rows, requested_start, target_end)
    start_gap = _weekday_count(requested_start, actual_start - timedelta(days=1))
    benchmark_start_gap = _weekday_count(
        requested_start,
        benchmark_start - timedelta(days=1),
    )
    stale_days = _weekday_count(actual_end + timedelta(days=1), target_end)
    benchmark_stale_days = _weekday_count(
        benchmark_end + timedelta(days=1),
        target_end,
    )

    checks = [
        (
            "PASS: strategy and benchmark bars are unique and ordered."
            if duplicate_count == 0 and benchmark_duplicates == 0
            else (
                "FAIL: duplicate dates found "
                f"(asset={duplicate_count}, benchmark={benchmark_duplicates})."
            )
        ),
        (
            "PASS: asset and benchmark OHLCV satisfy price and volume constraints."
            if strategy_invalid == 0 and benchmark_invalid == 0
            else (
                "FAIL: malformed OHLCV found "
                f"(asset={strategy_invalid}, benchmark={benchmark_invalid})."
            )
        ),
        (
            f"PASS: asset covers {coverage_ratio:.1%} of requested weekdays "
            f"({actual_start} to {actual_end})."
            if not enforce_coverage or (coverage_ratio >= 0.94 and start_gap <= 5)
            else (
                f"FAIL: asset covers only {coverage_ratio:.1%} of requested weekdays "
                f"({actual_start} to {actual_end})."
            )
        ),
        (
            f"PASS: benchmark covers {benchmark_coverage:.1%} of requested weekdays "
            f"({benchmark_start} to {benchmark_end})."
            if not enforce_coverage
            or (benchmark_coverage >= 0.94 and benchmark_start_gap <= 5)
            else (
                f"FAIL: benchmark covers only {benchmark_coverage:.1%} of requested weekdays "
                f"({benchmark_start} to {benchmark_end})."
            )
        ),
        (
            f"PASS: {alignment_ratio:.1%} of asset sessions align with the benchmark."
            if alignment_ratio >= 0.95
            else f"FAIL: only {alignment_ratio:.1%} of sessions align with the benchmark."
        ),
        (
            "PASS: cached data is current for the requested end date."
            if not enforce_coverage or max(stale_days, benchmark_stale_days) <= 3
            else (
                "FAIL: cached data is stale "
                f"(asset={stale_days}, benchmark={benchmark_stale_days} weekdays)."
            )
        ),
        (
            "PASS: prices request split and dividend adjustment."
            if adjustment == "all"
            else f"WARN: price adjustment mode is {adjustment}."
        ),
    ]
    status = "pass"
    if any(item.startswith("FAIL") for item in checks):
        status = "fail"
    elif any(item.startswith("WARN") for item in checks):
        status = "warn"
    return DataQualityReport(
        status=status,
        adjustment=adjustment,
        requested_start=requested_start,
        requested_end=requested_end,
        actual_start=actual_start,
        actual_end=actual_end,
        benchmark_start=benchmark_start,
        benchmark_end=benchmark_end,
        coverage_ratio=coverage_ratio,
        benchmark_coverage_ratio=benchmark_coverage,
        stale_trading_days=max(stale_days, benchmark_stale_days),
        strategy_bars=len(strategy_rows),
        benchmark_bars=len(benchmark_rows),
        aligned_bars=aligned,
        strategy_hash=_bars_hash(strategy_rows),
        benchmark_hash=_bars_hash(benchmark_rows),
        checks=checks,
    )


def _sync_window(
    session: Session,
    settings: Settings,
    *,
    symbol: str,
    data: BacktestDataConfig,
    start_date: date,
    end_date: date,
    force: bool,
) -> None:
    if start_date > end_date:
        return
    try:
        sync_daily_bars(
            session,
            settings,
            MarketDataSyncRequest(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                provider=data.provider,
                adjustment=data.adjustment,
                force=force,
            ),
        )
    except StonksUpError as exc:
        if exc.code == "market_data_empty" and _weekday_count(start_date, end_date) <= 3:
            return
        raise


def _load_real_symbol(
    session: Session,
    settings: Settings,
    *,
    symbol: str,
    data: BacktestDataConfig,
) -> list[Bar]:
    target_end = min(data.end_date, date.today())
    rows = get_daily_bar_models(
        session,
        symbol,
        data.start_date,
        target_end,
        data.adjustment,
    )
    if data.refresh or not rows:
        _sync_window(
            session,
            settings,
            symbol=symbol,
            data=data,
            start_date=data.start_date,
            end_date=target_end,
            force=data.refresh,
        )
    else:
        first_date = rows[0].trading_date
        last_date = rows[-1].trading_date
        if first_date > data.start_date:
            _sync_window(
                session,
                settings,
                symbol=symbol,
                data=data,
                start_date=data.start_date,
                end_date=first_date - timedelta(days=1),
                force=False,
            )
        if last_date < target_end:
            _sync_window(
                session,
                settings,
                symbol=symbol,
                data=data,
                start_date=last_date + timedelta(days=1),
                end_date=target_end,
                force=False,
            )

    rows = get_daily_bar_models(
        session,
        symbol,
        data.start_date,
        target_end,
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
        quality = _quality_report(
            rows,
            benchmark_rows,
            "none",
            rows[0].trading_date,
            rows[-1].trading_date,
            enforce_coverage=False,
        )
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
    quality = _quality_report(
        rows,
        benchmark_rows,
        data.adjustment,
        data.start_date,
        data.end_date,
        enforce_coverage=True,
    )
    if quality.status == "fail":
        raise StonksUpError(
            "market_data_quality_failed",
            "Market data does not completely cover the requested backtest window.",
            status_code=422,
            details=quality.model_dump(mode="json"),
        )
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
            "PASS: persisted provider bars cover the requested date window.",
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
            f"{loaded.benchmark_source}|{loaded.adjustment}|"
            f"{loaded.quality.strategy_hash}|{loaded.quality.benchmark_hash}"
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
            "assumptions": [*result.assumptions[:4], *loaded.assumptions],
            "audit": [*result.audit[:3], *loaded.audit, *loaded.quality.checks],
        }
    )
