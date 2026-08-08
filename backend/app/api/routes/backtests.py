from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_app_settings,
    get_db_session,
    success_response,
)
from app.core.config import Settings
from app.core.errors import StonksUpError
from app.schemas.backtests import (
    BacktestResult,
    BacktestRunHistory,
    CompileAndRunRequest,
    CompileAndRunResult,
    CompileStrategyRequest,
    RunBacktestRequest,
    StrategyCompilation,
)
from app.schemas.common import ApiResponse
from app.schemas.walk_forward import RunWalkForwardRequest, WalkForwardResult
from app.services.backtest_analysis import enrich_backtest_result
from app.services.backtest_data import apply_data_provenance, load_backtest_data
from app.services.backtest_engine import run_backtest
from app.services.backtest_persistence import (
    get_backtest_run_history,
    persist_backtest,
)
from app.services.strategy_compiler import compile_strategy
from app.services.walk_forward import run_walk_forward
from app.services.walk_forward_persistence import persist_walk_forward


router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("/compile", response_model=ApiResponse[StrategyCompilation])
def compile_natural_language_strategy(
    payload: CompileStrategyRequest,
    request: Request,
) -> ApiResponse[StrategyCompilation]:
    return success_response(request, compile_strategy(payload))


@router.get("/runs", response_model=ApiResponse[BacktestRunHistory])
def list_backtest_runs(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_db_session),
) -> ApiResponse[BacktestRunHistory]:
    return success_response(request, get_backtest_run_history(session, limit))


def _execute_backtest(
    *,
    session: Session,
    settings: Settings,
    strategy,
    config,
    data,
    bars: int,
) -> BacktestResult:
    loaded = load_backtest_data(
        session,
        settings,
        strategy,
        data,
        bars,
    )
    result = run_backtest(loaded.rows, strategy, config)
    result = enrich_backtest_result(result, loaded, config)
    return apply_data_provenance(result, loaded)


@router.post("/run", response_model=ApiResponse[BacktestResult])
def run_compiled_strategy(
    payload: RunBacktestRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_db_session),
) -> ApiResponse[BacktestResult]:
    result = _execute_backtest(
        session=session,
        settings=settings,
        strategy=payload.strategy,
        config=payload.config,
        data=payload.data,
        bars=payload.bars,
    )
    persist_backtest(
        session,
        prompt=payload.strategy.name,
        strategy_spec=payload.strategy,
        config=payload.config,
        data=payload.data,
        result=result,
    )
    return success_response(request, result)


@router.post("/walk-forward", response_model=ApiResponse[WalkForwardResult])
def run_walk_forward_validation(
    payload: RunWalkForwardRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_db_session),
) -> ApiResponse[WalkForwardResult]:
    loaded = load_backtest_data(
        session,
        settings,
        payload.strategy,
        payload.data,
        payload.bars,
    )
    try:
        execution = run_walk_forward(
            loaded,
            payload.strategy,
            payload.config,
            payload.validation,
        )
    except ValueError as exc:
        raise StonksUpError(
            "invalid_walk_forward",
            str(exc),
            status_code=422,
        ) from exc
    persist_walk_forward(
        session,
        prompt=payload.strategy.name,
        strategy_spec=payload.strategy,
        config=payload.config,
        data=payload.data,
        validation=payload.validation,
        execution=execution,
    )
    return success_response(request, execution.result)


@router.post("/compile-and-run", response_model=ApiResponse[CompileAndRunResult])
def compile_and_run_strategy(
    payload: CompileAndRunRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_db_session),
) -> ApiResponse[CompileAndRunResult]:
    compilation = compile_strategy(CompileStrategyRequest(prompt=payload.prompt))
    result = _execute_backtest(
        session=session,
        settings=settings,
        strategy=compilation.strategy,
        config=payload.config,
        data=payload.data,
        bars=payload.bars,
    )
    persist_backtest(
        session,
        prompt=payload.prompt,
        strategy_spec=compilation.strategy,
        config=payload.config,
        data=payload.data,
        result=result,
    )
    return success_response(
        request,
        CompileAndRunResult(compilation=compilation, backtest=result),
    )
