from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class JournalTradePayload(BaseModel):
    id: UUID
    symbol: str = Field(default="", max_length=16)
    side: Literal["buy", "sell", "short", "cover"] = "buy"
    executed_at: datetime | None = None
    price: Decimal | None = Field(default=None, ge=0)
    quantity: Decimal | None = Field(default=None, gt=0)
    planned: bool = True
    note: str = Field(default="", max_length=10_000)


class JournalEntryPayload(BaseModel):
    date: date
    status: Literal["draft", "completed"] = "draft"
    market_phase: str = Field(default="", max_length=50_000)
    market_notes: str = Field(default="", max_length=50_000)
    focus: str = Field(default="", max_length=50_000)
    targets: str = Field(default="", max_length=50_000)
    trade_plan: str = Field(default="", max_length=50_000)
    max_daily_loss_pct: Decimal | None = Field(default=None, ge=0, le=100)
    market_outcome: str = Field(default="", max_length=50_000)
    execution_notes: str = Field(default="", max_length=50_000)
    daily_summary: str = Field(default="", max_length=50_000)
    plan_adherence: str = Field(default="", max_length=50_000)
    lessons: str = Field(default="", max_length=50_000)
    next_improvement: str = Field(default="", max_length=50_000)
    postmarket_completed_at: datetime | None = None
    trades: list[JournalTradePayload] = Field(default_factory=list, max_length=500)
    ai_review: str = Field(default="", max_length=50_000)
    ai_updated_at: datetime | None = None
    updated_at: datetime


class JournalEntryView(JournalEntryPayload):
    saved_at: datetime
    plan_is_locked: bool
    plan_locked_at: datetime | None
    plan_revision: int
    plan_history: list[dict[str, Any]]
    ai_evidence: list[dict[str, Any]]


class JournalMarketEvidence(BaseModel):
    symbol: str
    as_of: date
    close: float
    day_change_pct: float | None
    ema20: float | None
    atr14: float | None
    high_20d: float | None
    low_20d: float | None
    volume_ratio_20d: float | None
    data_source: str = "twelvedata:daily_adjusted"


class JournalAnalysisResult(BaseModel):
    analysis: str
    generated_at: datetime
    evidence: list[JournalMarketEvidence]
    warnings: list[str] = Field(default_factory=list)


class JournalSyncRequest(BaseModel):
    entries: list[JournalEntryPayload] = Field(default_factory=list, max_length=5_000)


class JournalEntryCollection(BaseModel):
    entries: list[JournalEntryView]
