from collections.abc import Iterator
from typing import TypeVar

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import StonksUpError
from app.db.session import create_session
from app.schemas.common import ApiResponse, ResponseMeta


DataT = TypeVar("DataT")


def get_request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "unknown"))


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db_session(
    settings: Settings = Depends(get_app_settings),
) -> Iterator[Session]:
    if not settings.database_url:
        raise StonksUpError(
            "database_not_configured",
            "Database access is not configured.",
            status_code=503,
        )
    with create_session(settings.database_url) as session:
        yield session


def success_response(request: Request, data: DataT) -> ApiResponse[DataT]:
    return ApiResponse(
        success=True,
        data=data,
        meta=ResponseMeta(request_id=get_request_id(request)),
    )
