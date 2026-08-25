from fastapi import APIRouter

from app.api.routes import agent_runs, backtests, health, journal_entries, market_data


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(market_data.router)
api_router.include_router(backtests.router)
api_router.include_router(agent_runs.router)
api_router.include_router(journal_entries.router)
