from fastapi.testclient import TestClient


def test_container_health(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.text == "ok\n"


def test_live_health_uses_response_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")
    body = response.json()

    assert response.status_code == 200
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["status"] == "alive"
    assert body["data"]["version"] == "0.1.0"
    assert body["data"]["environment"] == "test"
    assert body["meta"]["request_id"] == response.headers["X-Request-ID"]


def test_ready_health_reports_database_state(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    body = response.json()

    assert response.status_code == 200
    assert body["data"]["status"] == "ready"
    assert body["data"]["checks"] == {
        "api": "ready",
        "database": "up",
    }


def test_request_id_is_propagated(client: TestClient) -> None:
    response = client.get(
        "/api/v1/health/live",
        headers={"X-Request-ID": "test-request-001"},
    )

    assert response.headers["X-Request-ID"] == "test-request-001"
    assert response.json()["meta"]["request_id"] == "test-request-001"


def test_not_found_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/missing")
    body = response.json()

    assert response.status_code == 404
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "http_404"
    assert body["meta"]["request_id"] == response.headers["X-Request-ID"]
