from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_engine
from app.main import create_app
from app.services.market_data import ProviderBar, ProviderBatch, TwelveDataClient


def test_real_market_data_runs_and_persists(monkeypatch, tmp_path: Path) -> None:
    start = date(2025, 1, 1)
    bars = [
        ProviderBar(
            trading_date=start + timedelta(days=index),
            open=Decimal(str(90 + index / 10)),
            high=Decimal(str(92 + index / 10)),
            low=Decimal(str(89 + index / 10)),
            close=Decimal(str(91 + index / 10)),
            volume=10_000_000 + index,
        )
        for index in range(140)
    ]
    batch = ProviderBatch(
        symbol="MU",
        instrument_name="Micron Technology",
        exchange="NASDAQ",
        currency="USD",
        bars=bars,
    )
    monkeypatch.setattr(TwelveDataClient, "fetch_daily", lambda *_args: batch)

    database_url = f"sqlite+pysqlite:///{(tmp_path / 'real.db').as_posix()}"
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    settings = Settings(
        environment="test",
        database_url=database_url,
        twelve_data_api_key="test-secret",
    )

    with TestClient(create_app(settings)) as client:
        response = client.post(
            "/api/v1/backtests/compile-and-run",
            json={
                "prompt": "MU buy near EMA5 and sell when close falls below EMA5",
                "data": {
                    "mode": "real",
                    "start_date": start.isoformat(),
                    "end_date": (start + timedelta(days=139)).isoformat(),
                },
            },
        )
        history = client.get("/api/v1/backtests/runs")
        persisted = client.get(
            (
                "/api/v1/market-data/bars/MU"
                f"?start_date={start.isoformat()}"
                f"&end_date={(start + timedelta(days=139)).isoformat()}"
            )
        )

    assert response.status_code == 200
    assert response.json()["data"]["backtest"]["bars"] == 140
    assert response.json()["data"]["backtest"]["data_source"].startswith("twelvedata:")
    assert history.json()["data"]["runs"][0]["data_source"].startswith("twelvedata:")
    assert len(persisted.json()["data"]["bars"]) == 140

    engine.dispose()
    get_engine.cache_clear()
