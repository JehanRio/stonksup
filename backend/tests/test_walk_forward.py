from sqlalchemy import func, select

from app.db.session import create_session
from app.models import Strategy, WalkForwardExperiment, WalkForwardTrial, WalkForwardWindow
from app.schemas.backtests import BacktestConfig, CompileStrategyRequest
from app.schemas.strategy_ir import (
    ConditionGroup,
    IndicatorSpec,
    PositionSizing,
    RiskRules,
    SignalRule,
    StrategyCondition,
    StrategyIR,
    StrategyOperand,
)
from app.services.backtest_engine import create_seeded_daily_history, run_backtest
from app.services.strategy_compiler import compile_strategy
from app.services.strategy_ir import ensure_search_parameters


def _custom_ir() -> StrategyIR:
    return ensure_search_parameters(
        StrategyIR(
            name="MU EMA RSI confirmation",
            symbol="MU",
            template="custom",
            indicators=[
                IndicatorSpec(id="entry_ema", kind="ema", period=5),
                IndicatorSpec(id="rsi", kind="rsi", period=14),
                IndicatorSpec(id="exit_ema", kind="ema", period=5),
            ],
            entry=SignalRule(
                reason="ema_rsi_entry",
                when=ConditionGroup(
                    mode="all",
                    conditions=[
                        StrategyCondition(
                            left=StrategyOperand(source="field", key="close"),
                            operator="crosses_above",
                            right=StrategyOperand(
                                source="indicator",
                                key="entry_ema",
                            ),
                        ),
                        StrategyCondition(
                            left=StrategyOperand(source="indicator", key="rsi"),
                            operator="lt",
                            right=StrategyOperand(source="constant", value=45),
                        ),
                    ],
                ),
            ),
            exit=SignalRule(
                reason="ema_exit",
                when=ConditionGroup(
                    mode="all",
                    conditions=[
                        StrategyCondition(
                            left=StrategyOperand(source="field", key="close"),
                            operator="crosses_below",
                            right=StrategyOperand(
                                source="indicator",
                                key="exit_ema",
                            ),
                        )
                    ],
                ),
            ),
            sizing=PositionSizing(value=0.9),
            risk=RiskRules(stop_loss_percent=8),
        )
    )


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


def test_custom_ir_walk_forward_tunes_declared_indicator_and_persists_ir(client) -> None:
    strategy_ir = _custom_ir()
    payload = {
        "strategy": {
            "name": strategy_ir.name,
            "symbol": "MU",
            "kind": "custom_ir",
            "stop_loss_percent": 8,
            "allocation_percent": 90,
        },
        "strategy_ir": strategy_ir.model_dump(mode="json"),
        "bars": 280,
        "data": {"mode": "demo"},
        "validation": {
            "train_bars": 120,
            "test_bars": 40,
            "search": {
                "period_min": 3,
                "period_max": 5,
                "period_step": 1,
                "stop_loss_min": 8,
                "stop_loss_max": 8,
                "stop_loss_step": 1,
                "minimum_trades": 0,
                "objective": "calmar",
            },
        },
    }

    first = client.post("/api/v1/backtests/walk-forward", json=payload)
    repeated = client.post("/api/v1/backtests/walk-forward", json=payload)

    assert first.status_code == 200
    assert repeated.status_code == 200
    result = first.json()["data"]
    assert result["experiment_id"] == repeated.json()["data"]["experiment_id"]
    assert result["strategy_kind"] == "custom_ir"
    assert result["primary_parameter"] == "indicator.entry_ema.period"
    assert result["window_count"] == 4
    assert result["candidate_count"] == 12
    assert {
        window["selected_period"] for window in result["windows"]
    }.issubset({3, 4, 5})
    assert all(
        window["train_end"] < window["test_start"]
        for window in result["windows"]
    )

    changed_payload = {
        **payload,
        "strategy_ir": strategy_ir.model_copy(
            update={
                "entry": strategy_ir.entry.model_copy(
                    update={
                        "when": strategy_ir.entry.when.model_copy(
                            update={
                                "conditions": [
                                    strategy_ir.entry.when.conditions[0],
                                    strategy_ir.entry.when.conditions[1].model_copy(
                                        update={
                                            "right": StrategyOperand(
                                                source="constant",
                                                value=35,
                                            )
                                        }
                                    ),
                                ]
                            }
                        )
                    }
                )
            },
            deep=True,
        ).model_dump(mode="json"),
    }
    changed = client.post("/api/v1/backtests/walk-forward", json=changed_payload)

    assert changed.status_code == 200
    assert changed.json()["data"]["experiment_id"] != result["experiment_id"]

    with create_session(client.app.state.settings.database_url) as session:
        stored = session.scalar(select(Strategy).where(Strategy.kind == "custom_ir"))
        assert stored is not None
        assert stored.definition["strategy_ir"]["search_parameters"][0][
            "indicator_id"
        ] == "entry_ema"
        assert len(stored.definition["strategy_ir_hash"]) == 64


def test_custom_ir_walk_forward_requires_ir(client) -> None:
    response = client.post(
        "/api/v1/backtests/walk-forward",
        json={
            "strategy": {
                "name": "Missing custom IR",
                "symbol": "MU",
                "kind": "custom_ir",
            },
            "bars": 280,
            "data": {"mode": "demo"},
            "validation": {
                "train_bars": 120,
                "test_bars": 40,
                "search": {"minimum_trades": 0},
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_walk_forward"
