from fastapi import APIRouter, Request

from app.api.dependencies import success_response
from app.schemas.backtests import (
    BacktestResult,
    CompileAndRunRequest,
    CompileAndRunResult,
    CompileStrategyRequest,
    RunBacktestRequest,
    StrategyCompilation,
)
from app.schemas.common import ApiResponse
from app.services.backtest_engine import create_seeded_daily_history, run_backtest
from app.services.strategy_compiler import compile_strategy


router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("/compile", response_model=ApiResponse[StrategyCompilation])
def compile_natural_language_strategy(
    payload: CompileStrategyRequest,
    request: Request,
) -> ApiResponse[StrategyCompilation]:
    return success_response(request, compile_strategy(payload))


@router.post("/run", response_model=ApiResponse[BacktestResult])
def run_compiled_strategy(
    payload: RunBacktestRequest,
    request: Request,
) -> ApiResponse[BacktestResult]:
    rows = create_seeded_daily_history(payload.strategy.symbol, payload.bars)
    result = run_backtest(rows, payload.strategy, payload.config)
    return success_response(request, result)


@router.post("/compile-and-run", response_model=ApiResponse[CompileAndRunResult])
def compile_and_run_strategy(
    payload: CompileAndRunRequest,
    request: Request,
) -> ApiResponse[CompileAndRunResult]:
    compilation = compile_strategy(CompileStrategyRequest(prompt=payload.prompt))
    rows = create_seeded_daily_history(compilation.strategy.symbol, payload.bars)
    result = run_backtest(rows, compilation.strategy, payload.config)
    return success_response(
        request,
        CompileAndRunResult(compilation=compilation, backtest=result),
    )
