from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.base import Base
from app.schemas.market_data import MarketDataSyncRequest
from app.services.market_data import (
    ProviderBar,
    ProviderBatch,
    TwelveDataClient,
    get_daily_bar_series,
    sync_daily_bars,
)


def test_market_data_sync_is_idempotent(monkeypatch) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    start = date(2025, 1, 2)
    batch = ProviderBatch(
        symbol="MU",
        instrument_name="Micron Technology",
        exchange="NASDAQ",
        currency="USD",
        bars=[
            ProviderBar(
                trading_date=start + timedelta(days=index),
                open=Decimal("100.00"),
                high=Decimal("102.00"),
                low=Decimal("99.00"),
                close=Decimal(str(100 + index)),
                volume=10_000_000 + index,
            )
            for index in range(2)
        ],
    )
    monkeypatch.setattr(TwelveDataClient, "fetch_daily", lambda *_args: batch)
    settings = Settings(
        environment="test",
        twelve_data_api_key="test-secret",
    )
    payload = MarketDataSyncRequest(
        symbol="mu",
        start_date=start,
        end_date=start + timedelta(days=1),
    )

    with Session(engine) as session:
        first = sync_daily_bars(session, settings, payload)
        session.commit()
        second = sync_daily_bars(session, settings, payload)
        session.commit()
        series = get_daily_bar_series(
            session,
            "MU",
            start,
            start + timedelta(days=1),
        )

    assert first.received_bars == 2
    assert first.stored_bars == 2
    assert second.stored_bars == 0
    assert len(series.bars) == 2
    assert series.bars[-1].close == 101
    engine.dispose()


def test_market_data_capability_reports_missing_key(client) -> None:
    response = client.get("/api/v1/market-data/capabilities")
    body = response.json()

    assert response.status_code == 200
    assert body["data"]["provider"] == "twelvedata"
    assert body["data"]["configured"] is False
    assert body["data"]["storage"] == "sqlite"
