"""Create persisted daily market bars.

Revision ID: 20260729_0002
Revises: 20260726_0001
Create Date: 2026-07-29
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260729_0002"
down_revision: str | None = "20260726_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "market_bars",
        sa.Column("instrument_id", sa.Uuid(), nullable=False),
        sa.Column("timeframe", sa.String(length=8), server_default="1d", nullable=False),
        sa.Column("trading_date", sa.Date(), nullable=False),
        sa.Column("open", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("high", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("low", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("close", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("adjusted_close", sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column("volume", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("adjustment", sa.String(length=24), server_default="raw", nullable=False),
        sa.Column("provider_metadata", sa.JSON(), nullable=False),
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
            name="fk_market_bars_instrument_id_instruments",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_market_bars"),
        sa.UniqueConstraint(
            "instrument_id",
            "timeframe",
            "trading_date",
            "source",
            name="uq_market_bars_instrument_timeframe_date_source",
        ),
    )
    op.create_index(
        "ix_market_bars_instrument_timeframe_date",
        "market_bars",
        ["instrument_id", "timeframe", "trading_date"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_market_bars_instrument_timeframe_date",
        table_name="market_bars",
    )
    op.drop_table("market_bars")
