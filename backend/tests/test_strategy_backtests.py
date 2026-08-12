from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.schemas.backtests import (
    BacktestConfig,
    CompileStrategyRequest,
    StrategyKind,
    StrategySpec,
)
from app.services.backtest_engine import Bar, create_seeded_daily_history, run_backtest
from app.services.strategy_compiler import compile_strategy


def test_compiler_builds_ema_pullback_contract() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(
            prompt="MU 跌到 EMA5 买入，收盘跌破 EMA5 卖出，使用 80% 仓位，亏损 6% 止损。"
        )
    )

    assert compilation.strategy.symbol == "MU"
    assert compilation.strategy.kind == StrategyKind.EMA_PULLBACK
    assert compilation.strategy.ema_period == 5
    assert compilation.strategy.entry_ema_period == 5
    assert compilation.strategy.exit_ema_period == 5
    assert compilation.strategy.allocation_percent == 80
    assert compilation.strategy.stop_loss_percent == 6
    assert compilation.strategy.signal_at == "close"
    assert compilation.strategy.fill_at == "next_open"
    assert compilation.contract_version == "strategy-dsl.v0.3"
    assert "盘中触及入场 EMA" in compilation.assumptions[-1]


def test_compiler_separates_entry_and_exit_ema_periods() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(
            prompt="MU 回踩 EMA20 并重新站稳时买入，收盘跌破 EMA5 时卖出。"
        )
    )

    assert compilation.strategy.entry_ema_period == 20
    assert compilation.strategy.exit_ema_period == 5
    assert "EMA20" in compilation.interpretation[0]
    assert "EMA5" in compilation.interpretation[1]


def test_compiler_declares_defaults_instead_of_hiding_them() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(prompt="跌到 EMA5 买入，跌破卖出")
    )

    assert compilation.strategy.symbol == "MU"
    assert compilation.strategy.stop_loss_percent == 8
    assert compilation.strategy.allocation_percent == 95
    assert any("默认使用 MU" in assumption for assumption in compilation.assumptions)
    assert any("默认止损" in warning for warning in compilation.warnings)
    assert any("95%" in warning for warning in compilation.warnings)


def test_ema_signal_executes_on_next_session_open() -> None:
    start = date(2025, 1, 1)
    prices = [
        (10.0, 10.2, 9.8, 10.0),
        (11.8, 12.2, 11.7, 12.0),
        (11.6, 11.8, 11.2, 11.5),
        (20.0, 20.2, 9.8, 10.0),
        (9.5, 10.1, 9.2, 9.8),
    ]
    prices.extend([(10.0, 10.2, 9.8, 10.0)] * 115)
    rows = [
        Bar(
            trading_date=start + timedelta(days=index),
            open=open_price,
            high=high,
            low=low,
            close=close,
            volume=1_000_000,
        )
        for index, (open_price, high, low, close) in enumerate(prices)
    ]
    strategy = StrategySpec(
        name="EMA2 next-open test",
        symbol="MU",
        kind=StrategyKind.EMA_PULLBACK,
        ema_period=2,
        stop_loss_percent=0,
        allocation_percent=100,
    )

    result = run_backtest(
        rows,
        strategy,
        BacktestConfig(initial_capital=10_000, commission_bps=0, slippage_bps=0),
    )

    assert result.trade_count == 1
    assert result.trades[0].entry_date == (start + timedelta(days=3)).isoformat()
    assert result.trades[0].entry_price == 20.0
    assert result.trades[0].exit_date == (start + timedelta(days=4)).isoformat()
    assert result.trades[0].exit_price == 9.5


def test_backtest_is_reproducible() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(prompt="MU 回踩 EMA5 买入，跌破 EMA5 卖出")
    )
    rows = create_seeded_daily_history("MU", 756)
    config = BacktestConfig()

    first = run_backtest(rows, compilation.strategy, config)
    second = run_backtest(rows, compilation.strategy, config)

    assert first.run_id == second.run_id
    assert first.final_equity == second.final_equity
    assert first.trades == second.trades
    assert first.trade_count > 0


def test_compile_and_run_api(client: TestClient) -> None:
    response = client.post(
        "/api/v1/backtests/compile-and-run",
        json={
            "prompt": "MU 跌到 EMA5 买入，跌破 EMA5 卖出，使用 90% 仓位",
            "bars": 300,
            "config": {
                "initial_capital": 100000,
                "commission_bps": 3,
                "slippage_bps": 5,
            },
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["compilation"]["strategy"]["kind"] == "ema_pullback"
    assert body["data"]["compilation"]["strategy"]["ema_period"] == 5
    assert body["data"]["backtest"]["bars"] == 300
    assert body["data"]["backtest"]["engine"] == "stonksup-deterministic-engine.v1"
    assert body["data"]["backtest"]["run_id"].startswith("BT-")
