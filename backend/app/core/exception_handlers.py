from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.dependencies import get_request_id
from app.core.errors import StonksUpError
from app.schemas.common import ApiResponse, ErrorDetail, ResponseMeta


def _error_response(
    request: Request,
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = ApiResponse[dict[str, object]](
        success=False,
        error=ErrorDetail(code=code, message=message, details=details or {}),
        meta=ResponseMeta(request_id=get_request_id(request)),
    )
    return jsonable_encoder(response)


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StonksUpError)
    async def handle_domain_error(request: Request, exc: StonksUpError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_response(
                request,
                code=exc.code,
                message=exc.message,
                details=exc.details,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_response(
                request,
                code="validation_error",
                message="Request validation failed.",
                details={"errors": exc.errors()},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_response(
                request,
                code=f"http_{exc.status_code}",
                message=str(exc.detail),
            ),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, _exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=_error_response(
                request,
                code="internal_error",
                message="An unexpected error occurred.",
            ),
        )
