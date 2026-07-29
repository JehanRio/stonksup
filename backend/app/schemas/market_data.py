from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator


MarketDataProvider = Literal["twelvedata"]
PriceAdjustment = Literal["all", "splits", "dividends", "none"]


def default_start_date() -> date:
    return date.today() - timedelta(days=365 * 5)


class MarketDataCapability(BaseModel):
    provider: MarketDataProvider
    configured: bool
    intervals: list[str]
    adjustments: list[PriceAdjustment]
    maximum_points_per_request: int
    storage: Literal["postgresql", "sqlite", "unconfigured"]
    message: str


class MarketDataSyncRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    start_date: date = Field(default_factory=default_start_date)
    end_date: date = Field(default_factory=date.today)
    provider: MarketDataProvider = "twelvedata"
    adjustment: PriceAdjustment = "all"
    force: bool = False

    @model_validator(mode="after")
    def validate_date_range(self) -> "MarketDataSyncRequest":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        if (self.end_date - self.start_date).days > 365 * 20:
            raise ValueError("date range cannot exceed 20 years")
        return self


class MarketDataSyncResult(BaseModel):
    symbol: str
    provider: MarketDataProvider
    timeframe: Literal["1d"]
    adjustment: PriceAdjustment
    start_date: date
    end_date: date
    received_bars: int
    stored_bars: int
    total_available_bars: int
    data_source: str


class MarketBarPoint(BaseModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class MarketBarSeries(BaseModel):
    symbol: str
    provider: MarketDataProvider
    timeframe: Literal["1d"]
    start_date: date
    end_date: date
    data_source: str
    adjustment: PriceAdjustment
    bars: list[MarketBarPoint]
