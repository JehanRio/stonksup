from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.backtests import (
    BacktestConfig,
    BacktestDataConfig,
    DataQualityReport,
    StrategySpec,
)
from app.schemas.strategy_ir import StrategyIR


WalkForwardObjective = Literal["calmar", "sharpe", "annualized_return"]
OverfittingRisk = Literal["low", "medium", "high"]


class ParameterSearchConfig(BaseModel):
    period_min: int = Field(default=3, ge=2, le=250)
    period_max: int = Field(default=15, ge=2, le=250)
    period_step: int = Field(default=1, ge=1, le=50)
    stop_loss_min: float = Field(default=5, ge=0, le=50)
    stop_loss_max: float = Field(default=10, ge=0, le=50)
    stop_loss_step: float = Field(default=1, gt=0, le=10)
    minimum_trades: int = Field(default=3, ge=0, le=1_000)
    objective: WalkForwardObjective = "calmar"

    @model_validator(mode="after")
    def validate_ranges(self) -> "ParameterSearchConfig":
        if self.period_min > self.period_max:
            raise ValueError("period_min must be lower than or equal to period_max")
        if self.stop_loss_min > self.stop_loss_max:
            raise ValueError("stop_loss_min must be lower than or equal to stop_loss_max")
        period_count = (self.period_max - self.period_min) // self.period_step + 1
        stop_count = math.floor(
            (self.stop_loss_max - self.stop_loss_min) / self.stop_loss_step + 1e-9
        ) + 1
        if period_count * stop_count > 400:
            raise ValueError("parameter search cannot exceed 400 candidates per window")
        return self


class WalkForwardConfig(BaseModel):
    train_bars: int = Field(default=252, ge=120, le=2_500)
    test_bars: int = Field(default=63, ge=20, le=504)
    search: ParameterSearchConfig = Field(default_factory=ParameterSearchConfig)


class RunWalkForwardRequest(BaseModel):
    strategy: StrategySpec
    strategy_ir: StrategyIR | None = None
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    data: BacktestDataConfig = Field(default_factory=BacktestDataConfig)
    validation: WalkForwardConfig = Field(default_factory=WalkForwardConfig)
    bars: int = Field(default=756, ge=240, le=5_000)


class ValidationMetrics(BaseModel):
    total_return: float
    annualized_return: float
    max_drawdown: float
    sharpe_ratio: float
    calmar_ratio: float
    trade_count: int
    win_rate: float


class WalkForwardAggregate(ValidationMetrics):
    initial_capital: float
    final_equity: float
    asset_return: float
    benchmark_return: float
    excess_return: float
    relative_return: float
    annualized_volatility: float
    parameter_stability: float


class WalkForwardCurvePoint(BaseModel):
    date: str
    strategy: float
    asset: float
    benchmark: float | None
    drawdown: float
    window: int


class WalkForwardWindowResult(BaseModel):
    sequence: int
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    primary_parameter: str
    selected_period: int
    selected_stop_loss: float
    objective_score: float
    robust_score: float
    candidate_count: int
    eligible_count: int
    used_fallback: bool
    train: ValidationMetrics
    test: ValidationMetrics


class ParameterSurfacePoint(BaseModel):
    period: int
    stop_loss: float
    mean_score: float
    mean_train_return: float
    eligible_rate: float
    selected_count: int


class WalkForwardResult(BaseModel):
    experiment_id: str
    symbol: str
    strategy_name: str
    strategy_kind: str
    engine: str
    data_source: str
    benchmark_symbol: str
    adjustment: str
    objective: WalkForwardObjective
    primary_parameter: str
    train_bars: int
    test_bars: int
    window_count: int
    candidate_count: int
    overfitting_risk: OverfittingRisk
    aggregate: WalkForwardAggregate
    average_train_score: float
    average_test_score: float
    windows: list[WalkForwardWindowResult]
    parameter_surface: list[ParameterSurfacePoint]
    equity_curve: list[WalkForwardCurvePoint]
    warnings: list[str]
    assumptions: list[str]
    audit: list[str]
    data_quality: DataQualityReport
