"""Create core investment and backtest tables.

Revision ID: 20260726_0001
Revises:
Create Date: 2026-07-26
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260726_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "instruments",
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("asset_type", sa.String(length=32), server_default="equity", nullable=False),
        sa.Column("exchange", sa.String(length=32), nullable=False),
        sa.Column("currency", sa.String(length=8), server_default="USD", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_instruments"),
        sa.UniqueConstraint(
            "symbol",
            "exchange",
            name="uq_instruments_symbol_exchange",
        ),
    )
    op.create_index(
        "ix_instruments_asset_type_active",
        "instruments",
        ["asset_type", "is_active"],
    )

    op.create_table(
        "strategies",
        sa.Column("instrument_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("kind", sa.String(length=48), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="draft", nullable=False),
        sa.Column(
            "contract_version",
            sa.String(length=16),
            server_default="1.0",
            nullable=False,
        ),
        sa.Column("natural_language_prompt", sa.Text(), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["instrument_id"],
            ["instruments.id"],
            name="fk_strategies_instrument_id_instruments",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_strategies"),
    )
    op.create_index("ix_strategies_instrument_id", "strategies", ["instrument_id"])
    op.create_index(
        "ix_strategies_status_updated_at",
        "strategies",
        ["status", "updated_at"],
    )

    op.create_table(
        "backtest_runs",
        sa.Column("strategy_id", sa.Uuid(), nullable=False),
        sa.Column("run_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="pending", nullable=False),
        sa.Column("data_source", sa.String(length=48), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("bar_count", sa.Integer(), nullable=False),
        sa.Column("trade_count", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["strategy_id"],
            ["strategies.id"],
            name="fk_backtest_runs_strategy_id_strategies",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_backtest_runs"),
        sa.UniqueConstraint("run_key", name="uq_backtest_runs_run_key"),
    )
    op.create_index(
        "ix_backtest_runs_strategy_id",
        "backtest_runs",
        ["strategy_id"],
    )
    op.create_index(
        "ix_backtest_runs_strategy_status",
        "backtest_runs",
        ["strategy_id", "status"],
    )

    op.create_table(
        "backtest_trades",
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("side", sa.String(length=12), nullable=False),
        sa.Column("entry_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_price", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("exit_price", sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=28, scale=10), nullable=False),
        sa.Column("pnl", sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column("return_pct", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("exit_reason", sa.String(length=48), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["backtest_runs.id"],
            name="fk_backtest_trades_run_id_backtest_runs",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_backtest_trades"),
        sa.UniqueConstraint(
            "run_id",
            "sequence",
            name="uq_backtest_trades_run_sequence",
        ),
    )
    op.create_index("ix_backtest_trades_run_id", "backtest_trades", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_backtest_trades_run_id", table_name="backtest_trades")
    op.drop_table("backtest_trades")
    op.drop_index("ix_backtest_runs_strategy_status", table_name="backtest_runs")
    op.drop_index("ix_backtest_runs_strategy_id", table_name="backtest_runs")
    op.drop_table("backtest_runs")
    op.drop_index("ix_strategies_status_updated_at", table_name="strategies")
    op.drop_index("ix_strategies_instrument_id", table_name="strategies")
    op.drop_table("strategies")
    op.drop_index("ix_instruments_asset_type_active", table_name="instruments")
    op.drop_table("instruments")
