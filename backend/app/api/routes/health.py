from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies import get_app_settings, success_response
from app.core.config import Settings
from app.db.health import check_database
from app.schemas.common import ApiResponse
from app.schemas.health import HealthStatus
from starlette.concurrency import run_in_threadpool


router = APIRouter(prefix="/health", tags=["health"])
SettingsDependency = Annotated[Settings, Depends(get_app_settings)]


@router.get("/live", response_model=ApiResponse[HealthStatus])
async def live(request: Request, settings: SettingsDependency) -> ApiResponse[HealthStatus]:
    return success_response(
        request,
        HealthStatus(
            service=settings.app_name,
            status="alive",
            version=settings.app_version,
            environment=settings.environment,
            build_sha=settings.build_sha,
            checks={"process": "up"},
        ),
    )


@router.get("/ready", response_model=ApiResponse[HealthStatus])
async def ready(
    request: Request,
    response: Response,
    settings: SettingsDependency,
) -> ApiResponse[HealthStatus]:
    database_status = await run_in_threadpool(check_database, settings.database_url)
    is_ready = database_status != "down"
    if not is_ready:
        response.status_code = 503

    return success_response(
        request,
        HealthStatus(
            service=settings.app_name,
            status="ready" if is_ready else "not_ready",
            version=settings.app_version,
            environment=settings.environment,
            build_sha=settings.build_sha,
            checks={
                "api": "ready",
                "database": database_status,
            },
        ),
    )
