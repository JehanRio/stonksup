from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import BacktestRun, BacktestTrade, Instrument, Strategy
from app.schemas.backtests import (
    BacktestConfig,
    BacktestDataConfig,
    BacktestResult,
    BacktestRunHistory,
    BacktestRunSummary,
    StrategySpec,
)


def _as_utc(value: str) -> datetime:
    return datetime.combine(date.fromisoformat(value), time.min, tzinfo=UTC)


def persist_backtest(
    session: Session,
    *,
    prompt: str,
    strategy_spec: StrategySpec,
    config: BacktestConfig,
    data: BacktestDataConfig,
    result: BacktestResult,
) -> None:
    existing = session.scalar(
        select(BacktestRun).where(BacktestRun.run_key == result.run_id)
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
        status="tested",
        contract_version=result.contract_version,
        natural_language_prompt=prompt,
        definition=strategy_spec.model_dump(mode="json"),
    )
    now = datetime.now(UTC)
    run = BacktestRun(
        strategy=strategy,
        run_key=result.run_id,
        status="completed",
        data_source=result.data_source,
        config={
            "execution": config.model_dump(mode="json"),
            "data": data.model_dump(mode="json"),
        },
        metrics={
            "initial_capital": result.initial_capital,
            "final_equity": result.final_equity,
            "total_return": result.total_return,
            "annualized_return": result.annualized_return,
            "benchmark_return": result.benchmark_return,
            "max_drawdown": result.max_drawdown,
            "sharpe_ratio": result.sharpe_ratio,
            "win_rate": result.win_rate,
            "profit_factor": result.profit_factor,
            "as_of": result.as_of,
        },
        bar_count=result.bars,
        trade_count=result.trade_count,
        started_at=now,
        completed_at=now,
    )
    for sequence, trade in enumerate(result.trades, start=1):
        run.trades.append(
            BacktestTrade(
                sequence=sequence,
                side="long",
                entry_at=_as_utc(trade.entry_date),
                exit_at=_as_utc(trade.exit_date),
                entry_price=Decimal(str(trade.entry_price)),
                exit_price=Decimal(str(trade.exit_price)),
                quantity=Decimal(str(trade.quantity)),
                pnl=Decimal(str(trade.pnl)),
                return_pct=Decimal(str(trade.return_percent)),
                exit_reason=trade.exit_reason,
            )
        )
    session.add(run)
    session.commit()


def get_backtest_run_history(session: Session, limit: int) -> BacktestRunHistory:
    rows = session.scalars(
        select(BacktestRun)
        .options(joinedload(BacktestRun.strategy).joinedload(Strategy.instrument))
        .order_by(BacktestRun.created_at.desc())
        .limit(limit)
    ).all()
    return BacktestRunHistory(
        runs=[
            BacktestRunSummary(
                run_id=row.run_key,
                created_at=row.created_at,
                symbol=row.strategy.instrument.symbol,
                strategy_name=row.strategy.name,
                strategy_kind=row.strategy.kind,
                status=row.status,
                data_source=row.data_source,
                bar_count=row.bar_count,
                trade_count=row.trade_count,
                total_return=float(row.metrics.get("total_return", 0)),
                final_equity=float(row.metrics.get("final_equity", 0)),
                as_of=str(row.metrics.get("as_of", "")),
            )
            for row in rows
        ]
    )
