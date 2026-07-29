from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import StonksUpError
from app.models import Instrument, MarketBar
from app.schemas.market_data import (
    MarketBarPoint,
    MarketBarSeries,
    MarketDataSyncRequest,
    MarketDataSyncResult,
)


TWELVE_DATA_BASE_URL = "https://api.twelvedata.com"
TWELVE_DATA_SOURCE = "twelvedata:time_series:1day:raw"


@dataclass(frozen=True)
class ProviderBar:
    trading_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


@dataclass(frozen=True)
class ProviderBatch:
    symbol: str
    instrument_name: str
    exchange: str
    currency: str
    bars: list[ProviderBar]


class TwelveDataClient:
    def __init__(self, api_key: str, timeout_seconds: float = 12) -> None:
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def fetch_daily(self, symbol: str, start_date: date, end_date: date) -> ProviderBatch:
        payload = self._request_json(
            "/time_series",
            {
                "symbol": symbol,
                "interval": "1day",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "order": "ASC",
                "outputsize": 5000,
                "format": "JSON",
            },
        )
        if payload.get("status") == "error" or "values" not in payload:
            raise StonksUpError(
                "market_data_provider_error",
                str(payload.get("message") or "Market data provider rejected the request."),
                status_code=502,
                details={"provider": "twelvedata", "code": payload.get("code")},
            )

        meta = payload.get("meta") or {}
        bars = [self._parse_bar(value) for value in payload.get("values", [])]
        bars.sort(key=lambda item: item.trading_date)
        if not bars:
            raise StonksUpError(
                "market_data_empty",
                f"No daily market data was returned for {symbol}.",
                status_code=404,
            )
        return ProviderBatch(
            symbol=str(meta.get("symbol") or symbol).upper(),
            instrument_name=str(meta.get("instrument_name") or symbol.upper()),
            exchange=str(meta.get("exchange") or "UNKNOWN"),
            currency=str(meta.get("currency") or "USD"),
            bars=bars,
        )

    def _request_json(self, path: str, params: dict[str, object]) -> dict[str, Any]:
        query = urlencode({**params, "apikey": self.api_key})
        request = Request(
            f"{TWELVE_DATA_BASE_URL}{path}?{query}",
            headers={"Accept": "application/json", "User-Agent": "StonksUp/0.1"},
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise StonksUpError(
                "market_data_http_error",
                "Market data provider returned an HTTP error.",
                status_code=502,
                details={"provider": "twelvedata", "status": exc.code},
            ) from exc
        except (URLError, TimeoutError) as exc:
            raise StonksUpError(
                "market_data_unavailable",
                "Market data provider is temporarily unavailable.",
                status_code=503,
                details={"provider": "twelvedata"},
            ) from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise StonksUpError(
                "market_data_invalid_response",
                "Market data provider returned an invalid response.",
                status_code=502,
                details={"provider": "twelvedata"},
            ) from exc

    @staticmethod
    def _parse_bar(value: dict[str, Any]) -> ProviderBar:
        try:
            return ProviderBar(
                trading_date=date.fromisoformat(str(value["datetime"])[:10]),
                open=Decimal(str(value["open"])),
                high=Decimal(str(value["high"])),
                low=Decimal(str(value["low"])),
                close=Decimal(str(value["close"])),
                volume=int(Decimal(str(value.get("volume") or 0))),
            )
        except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
            raise StonksUpError(
                "market_data_invalid_bar",
                "Market data provider returned a malformed OHLCV bar.",
                status_code=502,
                details={"provider": "twelvedata"},
            ) from exc


def get_twelve_data_client(settings: Settings) -> TwelveDataClient:
    if not settings.twelve_data_api_key:
        raise StonksUpError(
            "market_data_not_configured",
            "Real market data is not configured. Set STONKSUP_TWELVE_DATA_API_KEY.",
            status_code=503,
            details={"provider": "twelvedata"},
        )
    return TwelveDataClient(
        settings.twelve_data_api_key.get_secret_value(),
        settings.market_data_timeout_seconds,
    )


def sync_daily_bars(
    session: Session,
    settings: Settings,
    payload: MarketDataSyncRequest,
) -> MarketDataSyncResult:
    symbol = payload.symbol.strip().upper()
    client = get_twelve_data_client(settings)
    batch = client.fetch_daily(symbol, payload.start_date, payload.end_date)
    instrument = session.scalar(
        select(Instrument).where(Instrument.symbol == batch.symbol).limit(1)
    )
    if instrument is None:
        instrument = Instrument(
            symbol=batch.symbol,
            name=batch.instrument_name,
            exchange=batch.exchange,
            currency=batch.currency,
        )
        session.add(instrument)
        session.flush()
    else:
        instrument.name = batch.instrument_name
        instrument.currency = batch.currency

    existing = {
        item.trading_date: item
        for item in session.scalars(
            select(MarketBar).where(
                MarketBar.instrument_id == instrument.id,
                MarketBar.timeframe == "1d",
                MarketBar.source == TWELVE_DATA_SOURCE,
                MarketBar.trading_date.between(payload.start_date, payload.end_date),
            )
        )
    }
    stored = 0
    for bar in batch.bars:
        target = existing.get(bar.trading_date)
        if target is None:
            target = MarketBar(
                instrument=instrument,
                timeframe="1d",
                trading_date=bar.trading_date,
                source=TWELVE_DATA_SOURCE,
                adjustment="raw",
            )
            session.add(target)
        elif not payload.force:
            continue
        target.open = bar.open
        target.high = bar.high
        target.low = bar.low
        target.close = bar.close
        target.volume = bar.volume
        stored += 1

    session.flush()
    total = session.scalar(
        select(func.count(MarketBar.id)).where(
            MarketBar.instrument_id == instrument.id,
            MarketBar.timeframe == "1d",
            MarketBar.source == TWELVE_DATA_SOURCE,
        )
    )
    return MarketDataSyncResult(
        symbol=batch.symbol,
        provider="twelvedata",
        timeframe="1d",
        start_date=payload.start_date,
        end_date=payload.end_date,
        received_bars=len(batch.bars),
        stored_bars=stored,
        total_available_bars=int(total or 0),
        data_source=TWELVE_DATA_SOURCE,
    )


def get_daily_bar_models(
    session: Session,
    symbol: str,
    start_date: date,
    end_date: date,
) -> list[MarketBar]:
    normalized = symbol.strip().upper()
    return list(
        session.scalars(
            select(MarketBar)
            .join(Instrument)
            .where(
                Instrument.symbol == normalized,
                MarketBar.timeframe == "1d",
                MarketBar.source == TWELVE_DATA_SOURCE,
                MarketBar.trading_date.between(start_date, end_date),
            )
            .order_by(MarketBar.trading_date)
        )
    )


def get_daily_bar_series(
    session: Session,
    symbol: str,
    start_date: date,
    end_date: date,
) -> MarketBarSeries:
    rows = get_daily_bar_models(session, symbol, start_date, end_date)
    if not rows:
        raise StonksUpError(
            "market_data_not_found",
            f"No persisted daily market data was found for {symbol.upper()}.",
            status_code=404,
        )
    return MarketBarSeries(
        symbol=symbol.upper(),
        provider="twelvedata",
        timeframe="1d",
        start_date=rows[0].trading_date,
        end_date=rows[-1].trading_date,
        data_source=TWELVE_DATA_SOURCE,
        adjustment=rows[0].adjustment,
        bars=[
            MarketBarPoint(
                date=row.trading_date,
                open=float(row.open),
                high=float(row.high),
                low=float(row.low),
                close=float(row.close),
                volume=row.volume,
            )
            for row in rows
        ],
    )
