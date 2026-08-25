"""Create persistent trading journal entries.

Revision ID: 20260825_0006
Revises: 20260812_0005
Create Date: 2026-08-25
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260825_0006"
down_revision: str | None = "20260812_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "journal_entries",
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="draft", nullable=False),
        sa.Column("market_phase", sa.Text(), server_default="", nullable=False),
        sa.Column("market_notes", sa.Text(), server_default="", nullable=False),
        sa.Column("focus", sa.Text(), server_default="", nullable=False),
        sa.Column("targets", sa.Text(), server_default="", nullable=False),
        sa.Column("trade_plan", sa.Text(), server_default="", nullable=False),
        sa.Column("daily_summary", sa.Text(), server_default="", nullable=False),
        sa.Column("ai_review", sa.Text(), server_default="", nullable=False),
        sa.Column("ai_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_journal_entries"),
        sa.UniqueConstraint("entry_date", name="uq_journal_entries_entry_date"),
    )
    op.create_index("ix_journal_entries_entry_date", "journal_entries", ["entry_date"])


def downgrade() -> None:
    op.drop_index("ix_journal_entries_entry_date", table_name="journal_entries")
    op.drop_table("journal_entries")
