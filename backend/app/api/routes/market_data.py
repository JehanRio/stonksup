from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_app_settings, get_db_session, success_response
from app.core.config import Settings
from app.schemas.common import ApiResponse
from app.schemas.market_data import (
    MarketBarSeries,
    MarketDataCapability,
    MarketDataSyncRequest,
    MarketDataSyncResult,
    default_start_date,
)
from app.services.market_data import get_daily_bar_series, sync_daily_bars


router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.get("/capabilities", response_model=ApiResponse[MarketDataCapability])
def get_market_data_capabilities(
    request: Request,
    settings: Settings = Depends(get_app_settings),
) -> ApiResponse[MarketDataCapability]:
    configured = bool(settings.twelve_data_api_key)
    storage = "unconfigured"
    if settings.database_url:
        storage = "sqlite" if settings.database_url.startswith("sqlite") else "postgresql"
    return success_response(
        request,
        MarketDataCapability(
            provider="twelvedata",
            configured=configured,
            intervals=["1d"],
            maximum_points_per_request=5_000,
            storage=storage,
            message=(
                "Real daily market data is ready."
                if configured
                else "Add STONKSUP_TWELVE_DATA_API_KEY to enable real daily market data."
            ),
        ),
    )


@router.post("/sync", response_model=ApiResponse[MarketDataSyncResult])
def sync_market_data(
    payload: MarketDataSyncRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_db_session),
) -> ApiResponse[MarketDataSyncResult]:
    result = sync_daily_bars(session, settings, payload)
    session.commit()
    return success_response(request, result)


@router.get("/bars/{symbol}", response_model=ApiResponse[MarketBarSeries])
def get_market_data_bars(
    symbol: str,
    request: Request,
    start_date: date = Query(default_factory=default_start_date),
    end_date: date = Query(default_factory=date.today),
    session: Session = Depends(get_db_session),
) -> ApiResponse[MarketBarSeries]:
    return success_response(
        request,
        get_daily_bar_series(session, symbol, start_date, end_date),
    )
