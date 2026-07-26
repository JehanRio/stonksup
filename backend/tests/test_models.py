from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import BacktestRun, BacktestTrade, Instrument, Strategy


def test_core_models_persist_a_backtest_graph() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    entry_at = datetime(2026, 1, 5, tzinfo=UTC)
    instrument = Instrument(
        symbol="MU",
        name="Micron Technology",
        exchange="NASDAQ",
    )
    strategy = Strategy(
        instrument=instrument,
        name="MU trend confirmation",
        kind="moving_average_crossover",
        natural_language_prompt="20 day average crosses above 60 day average to buy.",
        definition={"fast_window": 20, "slow_window": 60},
    )
    run = BacktestRun(
        strategy=strategy,
        run_key="run-mu-2026-01",
        status="completed",
        data_source="seeded-demo",
        config={"initial_capital": 100000},
        metrics={"annualized_return": 0.18},
        bar_count=252,
        trade_count=1,
    )
    run.trades.append(
        BacktestTrade(
            sequence=1,
            side="long",
            entry_at=entry_at,
            exit_at=entry_at + timedelta(days=12),
            entry_price=Decimal("88.12000000"),
            exit_price=Decimal("96.45000000"),
            quantity=Decimal("100.0000000000"),
            pnl=Decimal("833.00000000"),
            return_pct=Decimal("9.453019"),
            exit_reason="signal",
        )
    )

    with Session(engine) as session:
        session.add(run)
        session.commit()
        run_id = run.id

    with Session(engine) as session:
        persisted = session.get(BacktestRun, run_id)
        assert persisted is not None
        assert persisted.strategy.instrument.symbol == "MU"
        assert persisted.metrics["annualized_return"] == 0.18
        assert len(persisted.trades) == 1
        assert persisted.trades[0].pnl == Decimal("833.00000000")

    engine.dispose()
