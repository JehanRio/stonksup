from sqlalchemy import func, select

from app.db.session import create_session
from app.models import WalkForwardExperiment, WalkForwardTrial, WalkForwardWindow
from app.schemas.backtests import BacktestConfig, CompileStrategyRequest
from app.services.backtest_engine import create_seeded_daily_history, run_backtest
from app.services.strategy_compiler import compile_strategy


def test_trade_start_uses_prior_bars_only_for_indicator_warmup() -> None:
    rows = create_seeded_daily_history("MU", 300)
    strategy = compile_strategy(
        CompileStrategyRequest(prompt="MU 回踩 EMA5 买入，跌破 EMA5 卖出")
    ).strategy
    trade_start = rows[200].trading_date

    result = run_backtest(
        rows,
        strategy,
        BacktestConfig(),
        trade_start_date=trade_start,
    )

    assert result.bars == 100
    assert result.equity_curve[0].date == trade_start.isoformat()
    assert all(trade.entry_date >= trade_start.isoformat() for trade in result.trades)
    assert any("warm-up" in item.lower() for item in result.assumptions)


def test_walk_forward_is_reproducible_separated_and_persisted(client) -> None:
    payload = {
        "strategy": {
            "name": "MU EMA walk-forward",
            "symbol": "MU",
            "kind": "ema_pullback",
            "ema_period": 5,
        },
        "bars": 280,
        "data": {"mode": "demo"},
        "validation": {
            "train_bars": 120,
            "test_bars": 40,
            "search": {
                "period_min": 3,
                "period_max": 5,
                "period_step": 1,
                "stop_loss_min": 5,
                "stop_loss_max": 6,
                "stop_loss_step": 1,
                "minimum_trades": 0,
                "objective": "calmar",
            },
        },
    }

    first = client.post("/api/v1/backtests/walk-forward", json=payload)
    second = client.post("/api/v1/backtests/walk-forward", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    result = first.json()["data"]
    assert result["experiment_id"] == second.json()["data"]["experiment_id"]
    assert result["window_count"] == 4
    assert result["candidate_count"] == 24
    assert len(result["equity_curve"]) == 160
    assert all(
        window["train_end"] < window["test_start"]
        for window in result["windows"]
    )
    assert all(
        result["windows"][index]["test_end"]
        < result["windows"][index + 1]["test_start"]
        for index in range(len(result["windows"]) - 1)
    )

    with create_session(client.app.state.settings.database_url) as session:
        assert session.scalar(select(func.count(WalkForwardExperiment.id))) == 1
        assert session.scalar(select(func.count(WalkForwardWindow.id))) == 4
        assert session.scalar(select(func.count(WalkForwardTrial.id))) == 24
