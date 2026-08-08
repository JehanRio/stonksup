from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Instrument,
    Strategy,
    WalkForwardExperiment,
    WalkForwardTrial,
    WalkForwardWindow,
)
from app.schemas.backtests import BacktestConfig, BacktestDataConfig, StrategySpec
from app.schemas.walk_forward import WalkForwardConfig
from app.services.strategy_compiler import CONTRACT_VERSION
from app.services.walk_forward import WalkForwardExecution


def _decimal(value: float) -> Decimal:
    return Decimal(str(round(value, 10)))


def persist_walk_forward(
    session: Session,
    *,
    prompt: str,
    strategy_spec: StrategySpec,
    config: BacktestConfig,
    data: BacktestDataConfig,
    validation: WalkForwardConfig,
    execution: WalkForwardExecution,
) -> None:
    result = execution.result
    existing = session.scalar(
        select(WalkForwardExperiment).where(
            WalkForwardExperiment.experiment_key == result.experiment_id
        )
    )
    if existing is not None:
        return

    instrument = session.scalar(
        select(Instrument).where(Instrument.symbol == strategy_spec.symbol).limit(1)
    )
    if instrument is None:
        instrument = Instrument(
            symbol=strategy_spec.symbol,
            name=strategy_spec.symbol,
            exchange="SIMULATED" if data.mode == "demo" else "UNKNOWN",
            currency="USD",
        )
        session.add(instrument)

    strategy = Strategy(
        instrument=instrument,
        name=strategy_spec.name,
        kind=strategy_spec.kind.value,
        status="validated",
        contract_version=CONTRACT_VERSION,
        natural_language_prompt=prompt,
        definition=strategy_spec.model_dump(mode="json"),
    )
    now = datetime.now(UTC)
    experiment = WalkForwardExperiment(
        strategy=strategy,
        experiment_key=result.experiment_id,
        status="completed",
        objective=result.objective,
        primary_parameter=result.primary_parameter,
        data_source=result.data_source,
        config={
            "execution": config.model_dump(mode="json"),
            "data": data.model_dump(mode="json"),
            "validation": validation.model_dump(mode="json"),
        },
        summary={
            "aggregate": result.aggregate.model_dump(mode="json"),
            "average_train_score": result.average_train_score,
            "average_test_score": result.average_test_score,
            "overfitting_risk": result.overfitting_risk,
            "warnings": result.warnings,
            "parameter_surface": [
                point.model_dump(mode="json") for point in result.parameter_surface
            ],
            "data_quality": result.data_quality.model_dump(mode="json"),
            "assumptions": result.assumptions,
            "audit": result.audit,
        },
        window_count=result.window_count,
        candidate_count=result.candidate_count,
        started_at=now,
        completed_at=now,
    )

    trials_by_window = defaultdict(list)
    for trial in execution.trials:
        trials_by_window[trial.window_sequence].append(trial)

    for result_window in result.windows:
        window = WalkForwardWindow(
            sequence=result_window.sequence,
            train_start=date.fromisoformat(result_window.train_start),
            train_end=date.fromisoformat(result_window.train_end),
            test_start=date.fromisoformat(result_window.test_start),
            test_end=date.fromisoformat(result_window.test_end),
            selected_parameters={
                result_window.primary_parameter: result_window.selected_period,
                "stop_loss_percent": result_window.selected_stop_loss,
            },
            train_metrics=result_window.train.model_dump(mode="json"),
            test_metrics=result_window.test.model_dump(mode="json"),
            objective_score=_decimal(result_window.objective_score),
            robust_score=_decimal(result_window.robust_score),
            candidate_count=result_window.candidate_count,
            eligible_count=result_window.eligible_count,
            used_fallback=result_window.used_fallback,
        )
        for trial in trials_by_window[result_window.sequence]:
            window.trials.append(
                WalkForwardTrial(
                    period=trial.period,
                    stop_loss=_decimal(trial.stop_loss),
                    objective_score=_decimal(trial.objective_score),
                    robust_score=_decimal(trial.robust_score),
                    eligible=trial.eligible,
                    selected=trial.selected,
                    metrics=trial.metrics.model_dump(mode="json"),
                )
            )
        experiment.windows.append(window)

    session.add(experiment)
    session.commit()
