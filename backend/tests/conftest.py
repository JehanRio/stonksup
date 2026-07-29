from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_engine
from app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'test.db').as_posix()}"
    engine = get_engine(database_url)
    Base.metadata.create_all(engine)
    settings = Settings(
        environment="test",
        build_sha="test-build",
        database_url=database_url,
        cors_origins=["http://testserver"],
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
    engine.dispose()
    get_engine.cache_clear()
