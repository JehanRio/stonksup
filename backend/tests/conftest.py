import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    settings = Settings(
        environment="test",
        build_sha="test-build",
        cors_origins=["http://testserver"],
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
