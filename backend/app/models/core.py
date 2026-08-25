from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Instrument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint("symbol", "exchange", name="uq_instruments_symbol_exchange"),
        Index("ix_instruments_asset_type_active", "asset_type", "is_active"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    asset_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="equity",
        server_default="equity",
    )
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="USD",
        server_default="USD",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    strategies: Mapped[list[Strategy]] = relationship(
        back_populates="instrument",
        passive_deletes=True,
    )
    market_bars: Mapped[list[MarketBar]] = relationship(
        back_populates="instrument",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MarketBar(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "market_bars"
    __table_args__ = (
        UniqueConstraint(
            "instrument_id",
            "timeframe",
            "trading_date",
            "source",
            name="uq_market_bars_instrument_timeframe_date_source",
        ),
        Index(
            "ix_market_bars_instrument_timeframe_date",
            "instrument_id",
            "timeframe",
            "trading_date",
        ),
    )

    instrument_id: Mapped[UUID] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"),
        nullable=False,
    )
    timeframe: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="1d",
        server_default="1d",
    )
    trading_date: Mapped[date] = mapped_column(nullable=False)
    open: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    adjusted_close: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    volume: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    adjustment: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="raw",
        server_default="raw",
    )
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    instrument: Mapped[Instrument] = relationship(back_populates="market_bars")


class Strategy(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "strategies"
    __table_args__ = (Index("ix_strategies_status_updated_at", "status", "updated_at"),)

    instrument_id: Mapped[UUID] = mapped_column(
        ForeignKey("instruments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(48), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    contract_version: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="1.0",
        server_default="1.0",
    )
    natural_language_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    instrument: Mapped[Instrument] = relationship(back_populates="strategies")
    runs: Mapped[list[BacktestRun]] = relationship(
        back_populates="strategy",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    walk_forward_experiments: Mapped[list[WalkForwardExperiment]] = relationship(
        back_populates="strategy",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class BacktestRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "backtest_runs"
    __table_args__ = (
        UniqueConstraint("run_key", name="uq_backtest_runs_run_key"),
        Index("ix_backtest_runs_strategy_status", "strategy_id", "status"),
    )

    strategy_id: Mapped[UUID] = mapped_column(
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    data_source: Mapped[str] = mapped_column(String(48), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    bar_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    trade_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)

    strategy: Mapped[Strategy] = relationship(back_populates="runs")
    trades: Mapped[list[BacktestTrade]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BacktestTrade.sequence",
    )


class BacktestTrade(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "backtest_trades"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_backtest_trades_run_sequence"),
    )

    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("backtest_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    side: Mapped[str] = mapped_column(String(12), nullable=False)
    entry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entry_price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    exit_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    return_pct: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    exit_reason: Mapped[str | None] = mapped_column(String(48))

    run: Mapped[BacktestRun] = relationship(back_populates="trades")


class WalkForwardExperiment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "walk_forward_experiments"
    __table_args__ = (
        UniqueConstraint("experiment_key", name="uq_walk_forward_experiments_key"),
        Index("ix_walk_forward_experiments_strategy_status", "strategy_id", "status"),
    )

    strategy_id: Mapped[UUID] = mapped_column(
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    experiment_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="completed",
        server_default="completed",
    )
    objective: Mapped[str] = mapped_column(String(32), nullable=False)
    primary_parameter: Mapped[str] = mapped_column(String(48), nullable=False)
    data_source: Mapped[str] = mapped_column(String(64), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    window_count: Mapped[int] = mapped_column(Integer, nullable=False)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    strategy: Mapped[Strategy] = relationship(back_populates="walk_forward_experiments")
    windows: Mapped[list[WalkForwardWindow]] = relationship(
        back_populates="experiment",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="WalkForwardWindow.sequence",
    )


class WalkForwardWindow(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "walk_forward_windows"
    __table_args__ = (
        UniqueConstraint(
            "experiment_id",
            "sequence",
            name="uq_walk_forward_windows_experiment_sequence",
        ),
    )

    experiment_id: Mapped[UUID] = mapped_column(
        ForeignKey("walk_forward_experiments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    train_start: Mapped[date] = mapped_column(nullable=False)
    train_end: Mapped[date] = mapped_column(nullable=False)
    test_start: Mapped[date] = mapped_column(nullable=False)
    test_end: Mapped[date] = mapped_column(nullable=False)
    selected_parameters: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )
    train_metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    test_metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    objective_score: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    robust_score: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False)
    eligible_count: Mapped[int] = mapped_column(Integer, nullable=False)
    used_fallback: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    experiment: Mapped[WalkForwardExperiment] = relationship(back_populates="windows")
    trials: Mapped[list[WalkForwardTrial]] = relationship(
        back_populates="window",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class WalkForwardTrial(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "walk_forward_trials"
    __table_args__ = (
        UniqueConstraint(
            "window_id",
            "period",
            "stop_loss",
            name="uq_walk_forward_trials_window_parameters",
        ),
        Index("ix_walk_forward_trials_window_selected", "window_id", "selected"),
    )

    window_id: Mapped[UUID] = mapped_column(
        ForeignKey("walk_forward_windows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    stop_loss: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    objective_score: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    robust_score: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    selected: Mapped[bool] = mapped_column(Boolean, nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    window: Mapped[WalkForwardWindow] = relationship(back_populates="trials")


class AgentRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_runs"
    __table_args__ = (Index("ix_agent_runs_status_created_at", "status", "created_at"),)

    run_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="running")
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(32))
    current_step: Mapped[str] = mapped_column(String(64), nullable=False)
    final_output: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    steps: Mapped[list[AgentStep]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AgentStep.sequence",
    )
    tool_calls: Mapped[list[AgentToolCall]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AgentToolCall.sequence",
    )
    model_calls: Mapped[list[AgentModelCall]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AgentModelCall.sequence",
    )


class AgentStep(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_steps"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_agent_steps_run_sequence"),
    )

    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    run: Mapped[AgentRun] = relationship(back_populates="steps")


class AgentToolCall(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_tool_calls"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_agent_tool_calls_run_sequence"),
    )

    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    arguments: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)

    run: Mapped[AgentRun] = relationship(back_populates="tool_calls")


class AgentModelCall(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_model_calls"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_agent_model_calls_run_sequence"),
    )

    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    input_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    finish_reason: Mapped[str | None] = mapped_column(String(32))
    output_summary: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)

    run: Mapped[AgentRun] = relationship(back_populates="model_calls")


class JournalEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("entry_date", name="uq_journal_entries_entry_date"),
        Index("ix_journal_entries_entry_date", "entry_date"),
    )

    entry_date: Mapped[date] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    market_phase: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    market_notes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    focus: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    targets: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    trade_plan: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    daily_summary: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    ai_review: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    ai_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
