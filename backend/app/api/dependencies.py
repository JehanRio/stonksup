from typing import TypeVar

from fastapi import Request

from app.core.config import Settings
from app.schemas.common import ApiResponse, ResponseMeta


DataT = TypeVar("DataT")


def get_request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "unknown"))


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def success_response(request: Request, data: DataT) -> ApiResponse[DataT]:
    return ApiResponse(
        success=True,
        data=data,
        meta=ResponseMeta(request_id=get_request_id(request)),
    )
