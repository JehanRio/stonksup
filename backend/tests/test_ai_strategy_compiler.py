import json

import pytest

from app.core.errors import StonksUpError
from app.schemas.backtests import BacktestConfig, StrategyKind
from app.services.ai_strategy_compiler import (
    compile_strategy_ir_candidate,
    compile_strategy_with_model,
)
from app.services.backtest_engine import create_seeded_daily_history, run_backtest
from app.services.llm_provider import ModelResponse, ModelUsage


PROMPT = (
    "MU 收盘价站上 EMA20 且 RSI14 低于 40，"
    "成交量高于 20 日均量 1.5 倍时买入；"
    "收盘跌破 EMA10 时卖出，止损 8%，使用 90% 仓位。"
)
ENTRY_EVIDENCE = (
    "MU 收盘价站上 EMA20 且 RSI14 低于 40，"
    "成交量高于 20 日均量 1.5 倍时买入"
)
EXIT_EVIDENCE = "收盘跌破 EMA10 时卖出"


def _operand(
    source: str,
    *,
    key: str | None = None,
    value: float | None = None,
    multiplier: float = 1,
) -> dict:
    return {
        "source": source,
        "key": key,
        "value": value,
        "offset": 0,
        "multiplier": multiplier,
    }


def _candidate() -> dict:
    return {
        "version": "strategy-ir.v1",
        "name": "MU EMA RSI volume confirmation",
        "symbol": "MU",
        "timeframe": "1d",
        "template": "custom",
        "indicators": [
            {"id": "ema20", "kind": "ema", "source": "close", "period": 20},
            {"id": "rsi14", "kind": "rsi", "source": "close", "period": 14},
            {
                "id": "volume_sma20",
                "kind": "sma",
                "source": "volume",
                "period": 20,
            },
            {"id": "ema10", "kind": "ema", "source": "close", "period": 10},
        ],
        "entry": {
            "reason": "mixed_entry",
            "when": {
                "mode": "all",
                "conditions": [
                    {
                        "left": _operand("field", key="close"),
                        "operator": "crosses_above",
                        "right": _operand("indicator", key="ema20"),
                        "tolerance_bps": 0,
                        "source_text": ENTRY_EVIDENCE,
                    },
                    {
                        "left": _operand("indicator", key="rsi14"),
                        "operator": "lt",
                        "right": _operand("constant", value=40),
                        "tolerance_bps": 0,
                        "source_text": ENTRY_EVIDENCE,
                    },
                    {
                        "left": _operand("field", key="volume"),
                        "operator": "gt",
                        "right": _operand(
                            "indicator", key="volume_sma20", multiplier=1.5
                        ),
                        "tolerance_bps": 0,
                        "source_text": ENTRY_EVIDENCE,
                    },
                ],
            },
        },
        "exit": {
            "reason": "ema_exit",
            "when": {
                "mode": "all",
                "conditions": [
                    {
                        "left": _operand("field", key="close"),
                        "operator": "crosses_below",
                        "right": _operand("indicator", key="ema10"),
                        "tolerance_bps": 0,
                        "source_text": EXIT_EVIDENCE,
                    }
                ],
            },
        },
        "sizing": {"mode": "target_cash_fraction", "value": 0.9},
        "risk": {"stop_loss_percent": 8},
        "execution": {
            "signal_at": "close",
            "fill_at": "next_open",
            "direction": "long_only",
            "max_positions": 1,
        },
    }


class FakeIrModelClient:
    provider = "fake"
    model = "semantic-model"

    def __init__(self, candidate: dict):
        self.candidate = candidate
        self.calls = 0

    def complete(self, _messages, _tools) -> ModelResponse:
        self.calls += 1
        return ModelResponse(
            content=None,
            tool_calls=[
                {
                    "id": "call-submit-ir",
                    "type": "function",
                    "function": {
                        "name": "submit_strategy_ir",
                        "arguments": json.dumps(
                            {"strategy_ir": self.candidate}, ensure_ascii=False
                        ),
                    },
                }
            ],
            finish_reason="tool_calls",
            usage=ModelUsage(input_tokens=100, output_tokens=200),
        )


def test_model_compiles_mixed_strategy_to_executable_ir() -> None:
    client = FakeIrModelClient(_candidate())

    compilation = compile_strategy_with_model(PROMPT, client)

    assert client.calls == 1
    assert compilation.strategy.kind == StrategyKind.CUSTOM_IR
    assert compilation.executable is True
    assert compilation.strategy_ir.entry.when.mode == "all"
    assert len(compilation.strategy_ir.entry.when.conditions) == 3
    assert compilation.strategy_ir.entry.when.conditions[2].right.multiplier == 1.5
    assert {"close", "high", "low", "open", "volume"}.issubset(
        compilation.manifest.required_fields
    )
    assert compilation.manifest.warmup_bars == 21


def test_custom_strategy_ir_executes_in_backtest_engine() -> None:
    compilation = compile_strategy_ir_candidate(PROMPT, _candidate())

    result = run_backtest(
        create_seeded_daily_history("MU", 300),
        compilation.strategy,
        BacktestConfig(),
        strategy_ir=compilation.strategy_ir,
    )

    assert result.engine == "stonksup-strategy-ir-engine.v2"
    assert result.contract_version == "strategy-ir.v1"
    assert result.run_id.startswith("BT-")


def test_harness_rejects_non_verbatim_evidence() -> None:
    candidate = _candidate()
    candidate["entry"]["when"]["conditions"][0]["source_text"] = "模型自己改写的条件"

    with pytest.raises(StonksUpError) as error:
        compile_strategy_ir_candidate(PROMPT, candidate)

    assert error.value.code == "ai_strategy_ir_rejected"
    assert error.value.status_code == 422


def test_harness_rejects_hallucinated_indicator() -> None:
    candidate = _candidate()
    candidate["indicators"].append(
        {"id": "ema50", "kind": "ema", "source": "close", "period": 50}
    )

    with pytest.raises(StonksUpError) as error:
        compile_strategy_ir_candidate(PROMPT, candidate)

    assert "unused indicator" in str(error.value.details)


def test_harness_rejects_changed_risk_number() -> None:
    candidate = _candidate()
    candidate["risk"]["stop_loss_percent"] = 6

    with pytest.raises(StonksUpError) as error:
        compile_strategy_ir_candidate(PROMPT, candidate)

    assert "stop loss" in str(error.value.details)


def test_hard_unsupported_clause_stops_before_model_call() -> None:
    client = FakeIrModelClient(_candidate())

    compilation = compile_strategy_with_model(
        "MU 财报超预期且 EMA20 站稳时买入，跌破 EMA10 时卖出。",
        client,
    )

    assert compilation.status == "unsupported"
    assert client.calls == 0
    assert "fundamental_data" in {item.code for item in compilation.issues}


def test_compile_ai_api_reports_missing_provider_configuration(client) -> None:
    response = client.post(
        "/api/v1/backtests/compile-ai",
        json={"prompt": "MU EMA20 站稳时买入，跌破 EMA10 时卖出。"},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "llm_provider_not_configured"
