"""Add staged journal workflow and structured trades.

Revision ID: 20260826_0007
Revises: 20260825_0006
Create Date: 2026-08-26
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260826_0007"
down_revision: str | None = "20260825_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("journal_entries", sa.Column("market_outcome", sa.Text(), server_default="", nullable=False))
    op.add_column("journal_entries", sa.Column("execution_notes", sa.Text(), server_default="", nullable=False))
    op.add_column("journal_entries", sa.Column("plan_adherence", sa.Text(), server_default="", nullable=False))
    op.add_column("journal_entries", sa.Column("lessons", sa.Text(), server_default="", nullable=False))
    op.add_column("journal_entries", sa.Column("next_improvement", sa.Text(), server_default="", nullable=False))
    op.add_column("journal_entries", sa.Column("max_daily_loss_pct", sa.Numeric(8, 4), nullable=True))
    op.add_column("journal_entries", sa.Column("plan_is_locked", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("journal_entries", sa.Column("plan_locked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("journal_entries", sa.Column("plan_revision", sa.Integer(), server_default="0", nullable=False))
    op.add_column("journal_entries", sa.Column("plan_history", sa.JSON(), server_default="[]", nullable=False))
    op.add_column("journal_entries", sa.Column("postmarket_completed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "journal_trades",
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=16), server_default="", nullable=False),
        sa.Column("side", sa.String(length=12), server_default="buy", nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("price", sa.Numeric(20, 8), nullable=True),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=True),
        sa.Column("planned", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["journal_entry_id"], ["journal_entries.id"], name="fk_journal_trades_journal_entry_id_journal_entries", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_journal_trades"),
    )
    op.create_index("ix_journal_trades_journal_entry_id", "journal_trades", ["journal_entry_id"])
    op.create_index("ix_journal_trades_entry_symbol", "journal_trades", ["journal_entry_id", "symbol"])


def downgrade() -> None:
    op.drop_index("ix_journal_trades_entry_symbol", table_name="journal_trades")
    op.drop_index("ix_journal_trades_journal_entry_id", table_name="journal_trades")
    op.drop_table("journal_trades")
    for column in (
        "postmarket_completed_at", "plan_history", "plan_revision", "plan_locked_at",
        "plan_is_locked", "max_daily_loss_pct", "next_improvement", "lessons",
        "plan_adherence", "execution_notes", "market_outcome",
    ):
        op.drop_column("journal_entries", column)
