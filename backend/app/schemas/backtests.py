from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.market_data import (
    MarketDataProvider,
    PriceAdjustment,
    default_start_date,
)
from app.schemas.strategy_ir import StrategyIR, StrategyManifest


class StrategyKind(str, Enum):
    EMA_PULLBACK = "ema_pullback"
    MA_CROSSOVER = "ma_crossover"
    MOMENTUM_BREAKOUT = "momentum_breakout"
    RSI_MEAN_REVERSION = "rsi_mean_reversion"
    CUSTOM_IR = "custom_ir"


class StrategySpec(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    symbol: str = Field(min_length=1, max_length=16)
    kind: StrategyKind
    timeframe: Literal["1d"] = "1d"
    ema_period: int = Field(default=5, ge=2, le=250)
    entry_ema_period: int = Field(default=5, ge=2, le=250)
    exit_ema_period: int = Field(default=5, ge=2, le=250)
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

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_ema_periods(cls, data):
        if not isinstance(data, dict):
            return data
        migrated = dict(data)
        legacy_period = migrated.get("ema_period", 5)
        migrated.setdefault("entry_ema_period", legacy_period)
        migrated.setdefault("exit_ema_period", legacy_period)
        return migrated

    @model_validator(mode="after")
    def validate_periods(self) -> "StrategySpec":
        if self.kind == StrategyKind.EMA_PULLBACK:
            self.ema_period = self.entry_ema_period
        if self.kind == StrategyKind.MA_CROSSOVER and self.fast_period >= self.slow_period:
            raise ValueError("fast_period must be lower than slow_period")
        return self


class CompileStrategyRequest(BaseModel):
    prompt: str = Field(min_length=4, max_length=4_000)
    preferred_kind: StrategyKind | None = None


class CompilationIssue(BaseModel):
    code: str
    severity: Literal["clarification", "unsupported"]
    message: str
    fragment: str | None = None


class StrategyCompilation(BaseModel):
    prompt: str
    strategy: StrategySpec
    status: Literal["ready", "needs_clarification", "unsupported"]
    executable: bool
    interpretation: list[str]
    assumptions: list[str]
    warnings: list[str]
    issues: list[CompilationIssue]
    normalized_prompt: str
    confidence: float = Field(ge=0, le=1)
    contract_version: str
    compiler: str
    strategy_ir: StrategyIR
    manifest: StrategyManifest


class BacktestConfig(BaseModel):
    initial_capital: float = Field(default=100_000, gt=0, le=1_000_000_000)
    commission_bps: float = Field(default=5, ge=0, le=1_000)
    slippage_bps: float = Field(default=5, ge=0, le=1_000)
    risk_free_rate_percent: float = Field(default=0, ge=-20, le=30)


class BacktestDataConfig(BaseModel):
    mode: Literal["demo", "real"] = "demo"
    provider: MarketDataProvider = "twelvedata"
    adjustment: PriceAdjustment = "all"
    benchmark_symbol: str = Field(default="SPY", min_length=1, max_length=16)
    start_date: date = Field(default_factory=default_start_date)
    end_date: date = Field(default_factory=date.today)
    refresh: bool = False

    @model_validator(mode="after")
    def validate_date_range(self) -> "BacktestDataConfig":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        if (self.end_date - self.start_date).days > 365 * 20:
            raise ValueError("date range cannot exceed 20 years")
        self.benchmark_symbol = self.benchmark_symbol.strip().upper()
        return self


class RunBacktestRequest(BaseModel):
    strategy: StrategySpec
    strategy_ir: StrategyIR | None = None
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    data: BacktestDataConfig = Field(default_factory=BacktestDataConfig)
    bars: int = Field(default=756, ge=120, le=5_000)


class CompileAndRunRequest(BaseModel):
    prompt: str = Field(min_length=4, max_length=4_000)
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    data: BacktestDataConfig = Field(default_factory=BacktestDataConfig)
    bars: int = Field(default=756, ge=120, le=5_000)


class EquityPoint(BaseModel):
    date: str
    strategy: float
    benchmark: float
    drawdown: float


class BenchmarkPoint(BaseModel):
    date: str
    value: float


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


class DataQualityReport(BaseModel):
    status: Literal["pass", "warn", "fail"]
    adjustment: PriceAdjustment
    requested_start: date
    requested_end: date
    actual_start: date
    actual_end: date
    benchmark_start: date
    benchmark_end: date
    coverage_ratio: float = Field(ge=0, le=1)
    benchmark_coverage_ratio: float = Field(ge=0, le=1)
    stale_trading_days: int = Field(ge=0)
    strategy_bars: int
    benchmark_bars: int
    aligned_bars: int
    strategy_hash: str
    benchmark_hash: str
    checks: list[str]


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
    benchmark_symbol: str = "SELF"
    benchmark_source: str = "derived"
    adjustment: PriceAdjustment = "none"
    asset_return: float = 0
    excess_return: float = 0
    relative_return: float = 0
    annualized_volatility: float = 0
    sortino_ratio: float = 0
    calmar_ratio: float = 0
    alpha: float = 0
    beta: float = 0
    average_holding_days: float = 0
    total_commission: float = 0
    benchmark_curve: list[BenchmarkPoint] = Field(default_factory=list)
    data_quality: DataQualityReport | None = None


class CompileAndRunResult(BaseModel):
    compilation: StrategyCompilation
    backtest: BacktestResult


class BacktestRunSummary(BaseModel):
    run_id: str
    created_at: datetime
    symbol: str
    strategy_name: str
    strategy_kind: str
    status: str
    data_source: str
    benchmark_symbol: str = "SELF"
    adjustment: str = "none"
    bar_count: int
    trade_count: int
    total_return: float
    excess_return: float = 0
    final_equity: float
    as_of: str


class BacktestRunHistory(BaseModel):
    runs: list[BacktestRunSummary]
