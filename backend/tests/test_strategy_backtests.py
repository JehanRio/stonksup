from datetime import date, timedelta

import pytest
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
    assert compilation.contract_version == "strategy-dsl.v0.4"
    assert compilation.status == "ready"
    assert compilation.executable is True


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


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        (
            "MU 回踩 EMA20 买入，收盘跌破 EMA5 卖出。",
            (StrategyKind.EMA_PULLBACK, 20, 5),
        ),
        (
            "MU 收盘跌破 EMA5 离场，盘中触碰 EMA20 并站稳后进场。",
            (StrategyKind.EMA_PULLBACK, 20, 5),
        ),
        (
            "MU 踩住 EMA20 做多，EMA5 下方收盘时平仓。",
            (StrategyKind.EMA_PULLBACK, 20, 5),
        ),
    ],
)
def test_ema_paraphrases_compile_to_same_contract(prompt, expected) -> None:
    compilation = compile_strategy(CompileStrategyRequest(prompt=prompt))

    assert compilation.status == "ready"
    assert (
        compilation.strategy.kind,
        compilation.strategy.entry_ema_period,
        compilation.strategy.exit_ema_period,
    ) == expected


@pytest.mark.parametrize(
    "prompt",
    [
        "AAPL MA10 金叉 MA30 买入，死叉卖出。",
        "AAPL 的10日均线上穿30日均线时进场，10日线下穿30日线时离场。",
    ],
)
def test_ma_crossover_paraphrases_compile_to_same_contract(prompt) -> None:
    compilation = compile_strategy(CompileStrategyRequest(prompt=prompt))

    assert compilation.status == "ready"
    assert compilation.strategy.kind == StrategyKind.MA_CROSSOVER
    assert compilation.strategy.fast_period == 10
    assert compilation.strategy.slow_period == 30


@pytest.mark.parametrize(
    "prompt",
    [
        "QQQ RSI14 低于28买入，高于60卖出。",
        "QQQ RSI(14) 小于 28 进场，大于 60 离场。",
    ],
)
def test_rsi_paraphrases_compile_to_same_contract(prompt) -> None:
    compilation = compile_strategy(CompileStrategyRequest(prompt=prompt))

    assert compilation.status == "ready"
    assert compilation.strategy.kind == StrategyKind.RSI_MEAN_REVERSION
    assert compilation.strategy.rsi_period == 14
    assert compilation.strategy.rsi_entry == 28
    assert compilation.strategy.rsi_exit == 60


@pytest.mark.parametrize(
    "prompt",
    [
        "NVDA 突破过去20日最高价买入，收盘跌破MA20卖出。",
        "NVDA 收盘创近20日新高时进场，收盘跌破20日均线时离场。",
    ],
)
def test_breakout_paraphrases_compile_to_same_contract(prompt) -> None:
    compilation = compile_strategy(CompileStrategyRequest(prompt=prompt))

    assert compilation.status == "ready"
    assert compilation.strategy.kind == StrategyKind.MOMENTUM_BREAKOUT
    assert compilation.strategy.lookback_period == 20


def test_compiler_blocks_unsupported_clauses_without_dropping_them() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(
            prompt="MU 回踩 EMA20 买入，财报超预期才执行，跌破 EMA5 卖出。"
        )
    )

    assert compilation.status == "unsupported"
    assert compilation.executable is False
    assert [item.code for item in compilation.issues] == ["fundamental_data"]


def test_compiler_requests_clarification_for_missing_symbol() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(prompt="回踩 EMA20 买入，跌破 EMA5 卖出。")
    )

    assert compilation.status == "needs_clarification"
    assert compilation.executable is False
    assert "symbol_missing" in {item.code for item in compilation.issues}


def test_ascii_feature_tokens_do_not_match_inside_normal_words() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(
            prompt="MU buy near EMA5 and sell when the close falls below EMA5"
        )
    )

    assert compilation.status == "ready"
    assert "fundamental_data" not in {item.code for item in compilation.issues}


def test_compiler_declares_defaults_instead_of_hiding_them() -> None:
    compilation = compile_strategy(
        CompileStrategyRequest(prompt="跌到 EMA5 买入，跌破卖出")
    )

    assert compilation.strategy.symbol == "MU"
    assert compilation.strategy.stop_loss_percent == 8
    assert compilation.strategy.allocation_percent == 95
    assert compilation.status == "needs_clarification"
    assert any(item.code == "symbol_missing" for item in compilation.issues)
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


def test_compile_and_run_api_blocks_unsupported_strategy(client: TestClient) -> None:
    response = client.post(
        "/api/v1/backtests/compile-and-run",
        json={
            "prompt": "MU 回踩 EMA20 买入，财报超预期才执行，跌破 EMA5 卖出。",
            "bars": 300,
        },
    )
    body = response.json()

    assert response.status_code == 422
    assert body["error"]["code"] == "strategy_compilation_blocked"
    assert body["error"]["details"]["status"] == "unsupported"
