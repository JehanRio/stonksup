"""Persist journal AI analysis evidence.

Revision ID: 20260826_0008
Revises: 20260826_0007
Create Date: 2026-08-26
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260826_0008"
down_revision: str | None = "20260826_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("journal_entries", sa.Column("ai_evidence", sa.JSON(), server_default="[]", nullable=False))


def downgrade() -> None:
    op.drop_column("journal_entries", "ai_evidence")
