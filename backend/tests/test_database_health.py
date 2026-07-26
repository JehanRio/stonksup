from app.db.health import check_database


def test_database_health_supports_optional_local_database() -> None:
    assert check_database(None) == "not_configured"


def test_database_health_checks_a_connection() -> None:
    assert check_database("sqlite+pysqlite:///:memory:") == "up"
    assert check_database("missing-dialect://localhost/db") == "down"
