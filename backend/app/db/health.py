from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool


def check_database(database_url: str | None) -> str:
    if not database_url:
        return "not_configured"

    connect_args = (
        {"connect_timeout": 2}
        if database_url.startswith(("postgresql://", "postgresql+psycopg://"))
        else {}
    )
    engine = None
    try:
        engine = create_engine(
            database_url,
            poolclass=NullPool,
            connect_args=connect_args,
        )
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return "up"
    except SQLAlchemyError:
        return "down"
    finally:
        if engine is not None:
            engine.dispose()
