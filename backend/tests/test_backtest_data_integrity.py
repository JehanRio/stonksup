from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_engine
from app.main import create_app
from app.services.backtest_data import _bars_hash, _quality_report
from app.services.backtest_engine import Bar
from app.services.market_data import ProviderBar, ProviderBatch, TwelveDataClient


def _weekdays(start: date, end: date) -> list[date]:
    return [
        start + timedelta(days=offset)
        for offset in range((end - start).days + 1)
        if (start + timedelta(days=offset)).weekday() < 5
    ]


def _engine_bars(start: date, count: int, *, high: float = 102) -> list[Bar]:
    rows: list[Bar] = []
    cursor = start
    while len(rows) < count:
        if cursor.weekday() < 5:
            rows.append(
                Bar(
                    trading_date=cursor,
                    open=100,
                    high=high,
                    low=99,
                    close=101,
                    volume=1_000_000 + len(rows),
                )
            )
        cursor += timedelta(days=1)
    return rows


def test_ohlcv_hash_changes_when_one_bar_changes() -> None:
    rows = _engine_bars(date(2025, 1, 2), 130)
    changed = list(rows)
    changed[60] = Bar(
        trading_date=changed[60].trading_date,
        open=changed[60].open,
        high=changed[60].high,
        low=changed[60].low,
        close=changed[60].close + 0.01,
        volume=changed[60].volume,
    )

    assert _bars_hash(rows) == _bars_hash(list(reversed(rows)))
    assert _bars_hash(rows) != _bars_hash(changed)


def test_quality_gate_rejects_malformed_benchmark_ohlcv() -> None:
    rows = _engine_bars(date(2025, 1, 2), 130)
    benchmark_rows = _engine_bars(date(2025, 1, 2), 130)
    benchmark_rows[10] = Bar(
        trading_date=benchmark_rows[10].trading_date,
        open=100,
        high=98,
        low=97,
        close=99,
        volume=1_000_000,
    )

    quality = _quality_report(
        rows,
        benchmark_rows,
        "all",
        rows[0].trading_date,
        rows[-1].trading_date,
        enforce_coverage=True,
    )

    assert quality.status == "fail"
    assert any("malformed OHLCV" in check for check in quality.checks)


def test_real_backtest_fills_both_sides_of_cached_window(
    monkeypatch,
    tmp_path: Path,
) -> None:
    requested_start = date(2025, 1, 2)
    cached_start = date(2025, 3, 3)
    cached_end = date(2025, 6, 30)
    requested_end = date(2025, 8, 1)
    calls: list[tuple[str, date, date]] = []

    def fake_fetch(
        _client,
        symbol,
        start_date,
        end_date,
        adjustment="all",
    ):
        calls.append((symbol, start_date, end_date))
        base = Decimal("90") if symbol == "MU" else Decimal("500")
        bars = [
            ProviderBar(
                trading_date=trading_date,
                open=base + Decimal(index) / 100,
                high=base + Decimal("2") + Decimal(index) / 100,
                low=base - Decimal("1") + Decimal(index) / 100,
                close=base + Decimal("1") + Decimal(index) / 100,
                volume=10_000_000 + index,
            )
            for index, trading_date in enumerate(_weekdays(start_date, end_date))
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
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'window.db').as_posix()}"
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    settings = Settings(
        environment="test",
        database_url=database_url,
        twelve_data_api_key="test-secret",
    )

    with TestClient(create_app(settings)) as client:
        for symbol in ("MU", "SPY"):
            seed = client.post(
                "/api/v1/market-data/sync",
                json={
                    "symbol": symbol,
                    "start_date": cached_start.isoformat(),
                    "end_date": cached_end.isoformat(),
                    "adjustment": "all",
                },
            )
            assert seed.status_code == 200

        calls.clear()
        response = client.post(
            "/api/v1/backtests/compile-and-run",
            json={
                "prompt": "MU buy near EMA5 and sell when close falls below EMA5",
                "data": {
                    "mode": "real",
                    "adjustment": "all",
                    "benchmark_symbol": "SPY",
                    "start_date": requested_start.isoformat(),
                    "end_date": requested_end.isoformat(),
                },
            },
        )

    assert response.status_code == 200
    assert calls == [
        ("MU", requested_start, cached_start - timedelta(days=1)),
        ("MU", cached_end + timedelta(days=1), requested_end),
        ("SPY", requested_start, cached_start - timedelta(days=1)),
        ("SPY", cached_end + timedelta(days=1), requested_end),
    ]
    quality = response.json()["data"]["backtest"]["data_quality"]
    assert quality["status"] == "pass"
    assert quality["requested_start"] == requested_start.isoformat()
    assert quality["requested_end"] == requested_end.isoformat()
    assert quality["actual_start"] == requested_start.isoformat()
    assert quality["actual_end"] == requested_end.isoformat()
    assert quality["coverage_ratio"] == 1
    assert len(quality["strategy_hash"]) == 64
    assert len(quality["benchmark_hash"]) == 64

    engine.dispose()
    get_engine.cache_clear()


def test_risk_free_rate_changes_metrics_and_relative_return_is_explicit(client) -> None:
    payload = {
        "prompt": "MU buy near EMA5 and sell when close falls below EMA5",
        "bars": 300,
        "data": {"mode": "demo", "benchmark_symbol": "SPY"},
    }
    zero = client.post(
        "/api/v1/backtests/compile-and-run",
        json={**payload, "config": {"risk_free_rate_percent": 0}},
    ).json()["data"]["backtest"]
    five = client.post(
        "/api/v1/backtests/compile-and-run",
        json={**payload, "config": {"risk_free_rate_percent": 5}},
    ).json()["data"]["backtest"]

    assert zero["sharpe_ratio"] != five["sharpe_ratio"]
    assert zero["alpha"] != five["alpha"]
    assert five["relative_return"] == (
        (1 + five["total_return"]) / (1 + five["benchmark_return"]) - 1
    )
    assert any("5%" in assumption for assumption in five["assumptions"])


def test_twelve_data_range_request_does_not_send_outputsize(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_request(_self, _path, params):
        captured.update(params)
        return {
            "status": "ok",
            "meta": {"symbol": "MU"},
            "values": [
                {
                    "datetime": "2025-01-02",
                    "open": "100",
                    "high": "102",
                    "low": "99",
                    "close": "101",
                    "volume": "1000",
                }
            ],
        }

    monkeypatch.setattr(TwelveDataClient, "_request_json", fake_request)
    TwelveDataClient("secret").fetch_daily(
        "MU",
        date(2025, 1, 1),
        date(2025, 1, 3),
        "all",
    )

    assert "outputsize" not in captured
