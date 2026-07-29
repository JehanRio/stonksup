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

    def fake_fetch(
        _client,
        symbol,
        _start_date,
        _end_date,
        adjustment="all",
    ):
        base = Decimal("90") if symbol == "MU" else Decimal("500")
        bars = [
            ProviderBar(
                trading_date=start + timedelta(days=index),
                open=base + Decimal(index) / 10,
                high=base + Decimal("2") + Decimal(index) / 10,
                low=base - Decimal("1") + Decimal(index) / 10,
                close=base + Decimal("1") + Decimal(index) / 10,
                volume=10_000_000 + index,
            )
            for index in range(140)
        ]
        return ProviderBatch(
            symbol=symbol,
            instrument_name=symbol,
            exchange="NASDAQ" if symbol == "MU" else "NYSE ARCA",
            currency="USD",
            adjustment=adjustment,
            bars=bars,
        )

    monkeypatch.setattr(TwelveDataClient, "fetch_daily", fake_fetch)

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
                    "adjustment": "all",
                    "benchmark_symbol": "SPY",
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
                "&adjustment=all"
            )
        )

    body = response.json()["data"]["backtest"]
    assert response.status_code == 200
    assert body["bars"] == 140
    assert body["data_source"].endswith("adjust-all")
    assert body["benchmark_symbol"] == "SPY"
    assert body["adjustment"] == "all"
    assert body["data_quality"]["status"] == "pass"
    assert len(body["benchmark_curve"]) == 140
    assert history.json()["data"]["runs"][0]["benchmark_symbol"] == "SPY"
    assert history.json()["data"]["runs"][0]["adjustment"] == "all"
    assert len(persisted.json()["data"]["bars"]) == 140

    engine.dispose()
    get_engine.cache_clear()
