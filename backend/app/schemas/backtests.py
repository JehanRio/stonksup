from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class StrategyKind(str, Enum):
    EMA_PULLBACK = "ema_pullback"
    MA_CROSSOVER = "ma_crossover"
    MOMENTUM_BREAKOUT = "momentum_breakout"
    RSI_MEAN_REVERSION = "rsi_mean_reversion"


class StrategySpec(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    symbol: str = Field(min_length=1, max_length=16)
    kind: StrategyKind
    timeframe: Literal["1d"] = "1d"
    ema_period: int = Field(default=5, ge=2, le=250)
    fast_period: int = Field(default=20, ge=2, le=120)
    slow_period: int = Field(default=60, ge=5, le=250)
    lookback_period: int = Field(default=20, ge=5, le=120)
    rsi_period: int = Field(default=14, ge=5, le=40)
    rsi_entry: float = Field(default=30, ge=1, le=49)
    rsi_exit: float = Field(default=55, ge=50, le=99)
    touch_tolerance_bps: int = Field(default=10, ge=0, le=200)
    stop_loss_percent: float = Field(default=8, ge=0, le=50)
    allocation_percent: float = Field(default=95, gt=0, le=100)
    signal_at: Literal["close"] = "close"
    fill_at: Literal["next_open"] = "next_open"
    long_only: Literal[True] = True

    @model_validator(mode="after")
    def validate_periods(self) -> "StrategySpec":
        if self.kind == StrategyKind.MA_CROSSOVER and self.fast_period >= self.slow_period:
            raise ValueError("fast_period must be lower than slow_period")
        return self


class CompileStrategyRequest(BaseModel):
    prompt: str = Field(min_length=4, max_length=4_000)
    preferred_kind: StrategyKind | None = None


class StrategyCompilation(BaseModel):
    prompt: str
    strategy: StrategySpec
    interpretation: list[str]
    assumptions: list[str]
    warnings: list[str]
    confidence: float = Field(ge=0, le=1)
    contract_version: str
    compiler: str


class BacktestConfig(BaseModel):
    initial_capital: float = Field(default=100_000, gt=0, le=1_000_000_000)
    commission_bps: float = Field(default=5, ge=0, le=1_000)
    slippage_bps: float = Field(default=5, ge=0, le=1_000)


class RunBacktestRequest(BaseModel):
    strategy: StrategySpec
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    bars: int = Field(default=756, ge=120, le=5_000)


class CompileAndRunRequest(BaseModel):
    prompt: str = Field(min_length=4, max_length=4_000)
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    bars: int = Field(default=756, ge=120, le=5_000)


class EquityPoint(BaseModel):
    date: str
    strategy: float
    benchmark: float
    drawdown: float


class BacktestTrade(BaseModel):
    id: str
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    quantity: int
    pnl: float
    return_percent: float
    exit_reason: str


class BacktestResult(BaseModel):
    run_id: str
    symbol: str
    strategy_name: str
    bars: int
    as_of: str
    data_source: str
    engine: str
    contract_version: str
    initial_capital: float
    final_equity: float
    total_return: float
    annualized_return: float
    benchmark_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    profit_factor: float
    trade_count: int
    equity_curve: list[EquityPoint]
    trades: list[BacktestTrade]
    assumptions: list[str]
    audit: list[str]


class CompileAndRunResult(BaseModel):
    compilation: StrategyCompilation
    backtest: BacktestResult
