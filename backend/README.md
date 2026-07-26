# StonksUp Backend

FastAPI service for market data, deterministic backtests, investment research
workflows, risk checks, and audit trails.

## Local development

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Without `STONKSUP_DATABASE_URL`, Alembic uses the local `stonksup.db` SQLite
file. Production injects a PostgreSQL connection string and enables pgvector.

API documentation: `http://127.0.0.1:8000/api/docs`

Health endpoints:

- `GET /healthz`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

## Database changes

Create a migration after changing SQLAlchemy models:

```powershell
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe change"
.\.venv\Scripts\python.exe -m alembic check
.\.venv\Scripts\python.exe -m alembic upgrade head
```

The container entrypoint always applies pending migrations before starting
Uvicorn.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest --cov=app --cov-report=term-missing
```
