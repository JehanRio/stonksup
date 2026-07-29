from fastapi import APIRouter

from app.api.routes import backtests, health


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(backtests.router)
