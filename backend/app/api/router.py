from fastapi import APIRouter

from app.api.routes import agent_runs, backtests, health, market_data


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(market_data.router)
api_router.include_router(backtests.router)
api_router.include_router(agent_runs.router)
