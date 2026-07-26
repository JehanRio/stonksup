from datetime import datetime, timezone
from typing import Generic, TypeVar

from pydantic import BaseModel, Field


DataT = TypeVar("DataT")


class ResponseMeta(BaseModel):
    request_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)


class ApiResponse(BaseModel, Generic[DataT]):
    success: bool
    data: DataT | None = None
    error: ErrorDetail | None = None
    meta: ResponseMeta
