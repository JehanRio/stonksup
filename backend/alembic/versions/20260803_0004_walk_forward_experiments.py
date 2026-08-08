"""Create walk-forward experiment, window, and trial tables.

Revision ID: 20260803_0004
Revises: 20260729_0003
Create Date: 2026-08-03
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260803_0004"
down_revision: str | None = "20260729_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "walk_forward_experiments",
        sa.Column("strategy_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="completed", nullable=False),
        sa.Column("objective", sa.String(length=32), nullable=False),
        sa.Column("primary_parameter", sa.String(length=48), nullable=False),
        sa.Column("data_source", sa.String(length=64), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("window_count", sa.Integer(), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["strategy_id"],
            ["strategies.id"],
            name="fk_walk_forward_experiments_strategy_id_strategies",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_walk_forward_experiments"),
        sa.UniqueConstraint("experiment_key", name="uq_walk_forward_experiments_key"),
    )
    op.create_index(
        "ix_walk_forward_experiments_strategy_id",
        "walk_forward_experiments",
        ["strategy_id"],
    )
    op.create_index(
        "ix_walk_forward_experiments_strategy_status",
        "walk_forward_experiments",
        ["strategy_id", "status"],
    )

    op.create_table(
        "walk_forward_windows",
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("train_start", sa.Date(), nullable=False),
        sa.Column("train_end", sa.Date(), nullable=False),
        sa.Column("test_start", sa.Date(), nullable=False),
        sa.Column("test_end", sa.Date(), nullable=False),
        sa.Column("selected_parameters", sa.JSON(), nullable=False),
        sa.Column("train_metrics", sa.JSON(), nullable=False),
        sa.Column("test_metrics", sa.JSON(), nullable=False),
        sa.Column("objective_score", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("robust_score", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("eligible_count", sa.Integer(), nullable=False),
        sa.Column("used_fallback", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["walk_forward_experiments.id"],
            name="fk_walk_forward_windows_experiment_id_walk_forward_experiments",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_walk_forward_windows"),
        sa.UniqueConstraint(
            "experiment_id",
            "sequence",
            name="uq_walk_forward_windows_experiment_sequence",
        ),
    )
    op.create_index(
        "ix_walk_forward_windows_experiment_id",
        "walk_forward_windows",
        ["experiment_id"],
    )

    op.create_table(
        "walk_forward_trials",
        sa.Column("window_id", sa.Uuid(), nullable=False),
        sa.Column("period", sa.Integer(), nullable=False),
        sa.Column("stop_loss", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("objective_score", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("robust_score", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("eligible", sa.Boolean(), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["window_id"],
            ["walk_forward_windows.id"],
            name="fk_walk_forward_trials_window_id_walk_forward_windows",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_walk_forward_trials"),
        sa.UniqueConstraint(
            "window_id",
            "period",
            "stop_loss",
            name="uq_walk_forward_trials_window_parameters",
        ),
    )
    op.create_index(
        "ix_walk_forward_trials_window_id",
        "walk_forward_trials",
        ["window_id"],
    )
    op.create_index(
        "ix_walk_forward_trials_window_selected",
        "walk_forward_trials",
        ["window_id", "selected"],
    )


def downgrade() -> None:
    op.drop_index("ix_walk_forward_trials_window_selected", table_name="walk_forward_trials")
    op.drop_index("ix_walk_forward_trials_window_id", table_name="walk_forward_trials")
    op.drop_table("walk_forward_trials")
    op.drop_index("ix_walk_forward_windows_experiment_id", table_name="walk_forward_windows")
    op.drop_table("walk_forward_windows")
    op.drop_index(
        "ix_walk_forward_experiments_strategy_status",
        table_name="walk_forward_experiments",
    )
    op.drop_index(
        "ix_walk_forward_experiments_strategy_id",
        table_name="walk_forward_experiments",
    )
    op.drop_table("walk_forward_experiments")
