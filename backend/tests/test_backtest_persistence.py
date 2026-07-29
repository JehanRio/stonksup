from fastapi.testclient import TestClient


def test_compile_and_run_is_persisted_in_history(client: TestClient) -> None:
    response = client.post(
        "/api/v1/backtests/compile-and-run",
        json={
            "prompt": "MU buy near EMA5 and sell when the close breaks below EMA5",
            "bars": 300,
            "data": {"mode": "demo"},
        },
    )
    assert response.status_code == 200
    run_id = response.json()["data"]["backtest"]["run_id"]

    history = client.get("/api/v1/backtests/runs?limit=5")
    body = history.json()

    assert history.status_code == 200
    assert len(body["data"]["runs"]) == 1
    assert body["data"]["runs"][0]["run_id"] == run_id
    assert body["data"]["runs"][0]["symbol"] == "MU"
    assert body["data"]["runs"][0]["bar_count"] == 300


def test_real_mode_explains_missing_provider_key(client: TestClient) -> None:
    response = client.post(
        "/api/v1/backtests/compile-and-run",
        json={
            "prompt": "MU buy near EMA5 and sell when the close breaks below EMA5",
            "data": {
                "mode": "real",
                "start_date": "2024-01-01",
                "end_date": "2025-12-31",
            },
        },
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "market_data_not_configured"
