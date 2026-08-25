from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class JournalEntryPayload(BaseModel):
    date: date
    status: Literal["draft", "completed"] = "draft"
    market_phase: str = Field(default="", max_length=50_000)
    market_notes: str = Field(default="", max_length=50_000)
    focus: str = Field(default="", max_length=50_000)
    targets: str = Field(default="", max_length=50_000)
    trade_plan: str = Field(default="", max_length=50_000)
    daily_summary: str = Field(default="", max_length=50_000)
    ai_review: str = Field(default="", max_length=50_000)
    ai_updated_at: datetime | None = None
    updated_at: datetime


class JournalEntryView(JournalEntryPayload):
    saved_at: datetime


class JournalSyncRequest(BaseModel):
    entries: list[JournalEntryPayload] = Field(default_factory=list, max_length=5_000)


class JournalEntryCollection(BaseModel):
    entries: list[JournalEntryView]
