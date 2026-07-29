"""Expand strategy contract version storage.

Revision ID: 20260729_0003
Revises: 20260729_0002
Create Date: 2026-07-29
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260729_0003"
down_revision: str | None = "20260729_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("strategies") as batch_op:
        batch_op.alter_column(
            "contract_version",
            existing_type=sa.String(length=16),
            type_=sa.String(length=32),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("strategies") as batch_op:
        batch_op.alter_column(
            "contract_version",
            existing_type=sa.String(length=32),
            type_=sa.String(length=16),
            existing_nullable=False,
        )
