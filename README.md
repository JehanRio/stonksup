# StonksUp

StonksUp is an AI investment decision workspace for research, portfolio exposure,
strategy backtesting, risk review, and decision journaling. The product is built as
a portfolio-grade agent project: the interface demonstrates the workflow today,
while the backend and database provide the foundation for durable runs, evidence,
and audit trails.

## Current capabilities

- Readable trading desk shell with dashboard, market, research, strategy, ledger,
  and system workspaces.
- Portfolio allocation and exposure views with recognizable asset logos.
- Interactive market chart whose wheel interaction stays inside the chart.
- Strategy Lab that compiles a natural-language idea into deterministic rules,
  runs a seeded backtest, and reports equity, drawdown, metrics, and trades.
- FastAPI service with consistent response envelopes, request IDs, health checks,
  and generated API documentation.
- SQLAlchemy models and Alembic migrations for instruments, strategies, backtest
  runs, and trades.
- Production Compose stack with Nginx, FastAPI, PostgreSQL 17 + pgvector, and
  persistent database storage.
- GitHub Actions tests both applications, publishes frontend/backend images to
  GHCR, and deploys the full stack to the server on every push to `main`.

## Local frontend

Prerequisites: Node.js 22.

```powershell
npm install
npm run dev
```

Optional AI configuration in `.env.local`:

- `GEMINI_API_KEY`

DeepSeek is configured only on the backend with
`STONKSUP_DEEPSEEK_API_KEY`; it is never included in the browser bundle.

Quality checks:

```powershell
npm run typecheck
npm run build
```

## Local backend

Prerequisites: Python 3.13.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

API documentation: `http://127.0.0.1:8000/api/docs`

Run backend tests:

```powershell
.\.venv\Scripts\python.exe -m pytest --cov=app --cov-report=term-missing
```

## Deployment

A push to `main` triggers `.github/workflows/deploy.yml`. The workflow runs the
backend tests and migrations, type-safe frontend build, two Docker image builds,
and an SSH deployment. The server stores its generated database password in
`/root/workspace/stonksup/.env.runtime`; that file never enters Git.

Production workspace: `http://175.178.17.89:3000/stonksup/`

Production API docs: `http://175.178.17.89:3000/api/docs`

The detailed product and engineering plan lives in
`docs/AI_INVESTMENT_DECISION_AGENT_DESIGN.md`.
