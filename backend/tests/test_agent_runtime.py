import json

from app.db.session import create_session
from app.schemas.agent_runs import CreateAgentRunRequest
from app.schemas.agent_runs import ContinueAgentRunRequest
from app.schemas.backtests import BacktestDataConfig
from app.schemas.walk_forward import ParameterSearchConfig, WalkForwardConfig
from app.services.agent_runtime import (
    continue_quant_agent,
    get_agent_run,
    get_agent_runs,
    run_quant_agent,
)
from app.services.llm_provider import ModelResponse, ModelUsage


class FakeModelClient:
    provider = "fake"
    model = "fake-tool-model"

    def __init__(self) -> None:
        self.turn = 0

    def complete(self, _messages, _tools) -> ModelResponse:
        self.turn += 1
        calls = {
            1: [
                {
                    "id": "call-compile",
                    "type": "function",
                    "function": {
                        "name": "compile_strategy",
                        "arguments": json.dumps(
                            {
                                "prompt": (
                                    "MU 回踩 EMA20 并重新站稳时买入，"
                                    "收盘跌破 EMA5 时卖出，止损 8%。"
                                )
                            },
                            ensure_ascii=False,
                        ),
                    },
                }
            ],
            2: [
                {
                    "id": "call-data",
                    "type": "function",
                    "function": {"name": "get_market_data_status", "arguments": "{}"},
                },
                {
                    "id": "call-backtest",
                    "type": "function",
                    "function": {"name": "run_backtest", "arguments": "{}"},
                },
            ],
            3: [
                {
                    "id": "call-walk-forward",
                    "type": "function",
                    "function": {"name": "run_walk_forward", "arguments": "{}"},
                }
            ],
        }.get(self.turn, [])
        return ModelResponse(
            content=(
                "计算事实：单次回测和样本外验证均已完成。"
                "风险判断：需要结合最大回撤和过拟合诊断继续评估。"
                if not calls
                else None
            ),
            tool_calls=calls,
            finish_reason="stop" if not calls else "tool_calls",
            usage=ModelUsage(input_tokens=100, output_tokens=20),
        )


class RewritingModelClient:
    provider = "fake"
    model = "fake-rewriter"

    def __init__(self) -> None:
        self.turn = 0

    def complete(self, _messages, _tools) -> ModelResponse:
        self.turn += 1
        if self.turn == 1:
            calls = [
                {
                    "id": "call-compile",
                    "type": "function",
                    "function": {
                        "name": "compile_strategy",
                        "arguments": json.dumps(
                            {"prompt": "MU 回踩 EMA20 买入，跌破 EMA5 卖出。"},
                            ensure_ascii=False,
                        ),
                    },
                }
            ]
            content = None
        elif self.turn == 2:
            calls = [
                {
                    "id": "call-backtest",
                    "type": "function",
                    "function": {"name": "run_backtest", "arguments": "{}"},
                }
            ]
            content = None
        else:
            calls = []
            content = "策略包含当前不支持的财报条件，已停止回测。"
        return ModelResponse(
            content=content,
            tool_calls=calls,
            finish_reason="stop" if not calls else "tool_calls",
            usage=ModelUsage(input_tokens=30, output_tokens=10),
        )


class CompileOnlyModelClient:
    provider = "fake"
    model = "fake-compile-only"

    def complete(self, _messages, _tools) -> ModelResponse:
        return ModelResponse(
            content=None,
            tool_calls=[
                {
                    "id": "call-compile",
                    "type": "function",
                    "function": {"name": "compile_strategy", "arguments": "{}"},
                }
            ],
            finish_reason="tool_calls",
            usage=ModelUsage(input_tokens=20, output_tokens=5),
        )


def test_quant_agent_calls_tools_and_persists_trace(client) -> None:
    request = CreateAgentRunRequest(
        prompt=(
            "验证 MU 回踩 EMA20 买入、跌破 EMA5 卖出的策略，"
            "运行单次回测和样本外验证。"
        ),
        data=BacktestDataConfig(mode="demo"),
        validation=WalkForwardConfig(
            train_bars=120,
            test_bars=40,
            search=ParameterSearchConfig(
                period_min=18,
                period_max=20,
                period_step=2,
                stop_loss_min=7,
                stop_loss_max=8,
                stop_loss_step=1,
                minimum_trades=0,
            ),
        ),
    )

    with create_session(client.app.state.settings.database_url) as session:
        result = run_quant_agent(
            session,
            client.app.state.settings,
            request,
            client=FakeModelClient(),
        )
        history = get_agent_runs(session, 10)
        persisted = get_agent_run(session, result.run_id)

    assert result.status == "completed"
    assert result.symbol == "MU"
    assert result.tool_call_count == 4
    assert result.model_call_count == 4
    assert [item.tool_name for item in result.tool_calls] == [
        "compile_strategy",
        "get_market_data_status",
        "run_backtest",
        "run_walk_forward",
    ]
    strategy = result.tool_calls[0].result["data"]["strategy"]
    assert strategy["entry_ema_period"] == 20
    assert strategy["exit_ema_period"] == 5
    assert result.tool_calls[-1].result["data"]["overfitting_risk"] in {
        "low",
        "medium",
        "high",
    }
    assert "signal_diagnostics" in result.tool_calls[2].result["data"]
    assert "signal_diagnostics" in result.tool_calls[3].result["data"]
    assert persisted.final_output == result.final_output
    assert history.runs[0].run_id == result.run_id


def test_agent_capability_reports_missing_key(client) -> None:
    response = client.get("/api/v1/agent-runs/capabilities")
    body = response.json()["data"]

    assert response.status_code == 200
    assert body["provider"] == "deepseek"
    assert body["configured"] is False
    assert "run_backtest" in body["tools"]


def test_agent_uses_original_prompt_and_blocks_model_rewrite(client) -> None:
    request = CreateAgentRunRequest(
        prompt="MU 回踩 EMA20 买入，财报超预期才执行，跌破 EMA5 卖出。",
        data=BacktestDataConfig(mode="demo"),
    )

    with create_session(client.app.state.settings.database_url) as session:
        result = run_quant_agent(
            session,
            client.app.state.settings,
            request,
            client=RewritingModelClient(),
        )

    assert result.status == "unsupported"
    assert result.current_step == "blocked"
    assert result.tool_call_count == 1
    compile_call = result.tool_calls[0]
    assert compile_call.result["data"]["status"] == "unsupported"
    assert compile_call.result["data"]["issues"][0]["code"] == "fundamental_data"
    assert "当前策略无法执行" in result.final_output


def test_agent_requests_clarification_and_continues_with_answers(client) -> None:
    request = CreateAgentRunRequest(
        prompt="MU 回踩 EMA20 买入。",
        data=BacktestDataConfig(mode="demo"),
    )

    with create_session(client.app.state.settings.database_url) as session:
        pending = run_quant_agent(
            session,
            client.app.state.settings,
            request,
            client=CompileOnlyModelClient(),
        )

        assert pending.status == "needs_clarification"
        assert pending.current_step == "awaiting_clarification"
        assert pending.can_continue is True
        assert pending.model_call_count == 1
        assert pending.tool_call_count == 1
        assert {item.code for item in pending.clarification_questions} == {
            "exit_action_missing",
            "exit_ema_missing",
        }

        continued = continue_quant_agent(
            session,
            client.app.state.settings,
            pending.run_id,
            ContinueAgentRunRequest(
                answers={
                    "exit_action_missing": "收盘跌破 EMA5 时卖出",
                    "exit_ema_missing": "EMA5",
                },
                data=BacktestDataConfig(mode="demo"),
                validation=WalkForwardConfig(
                    train_bars=120,
                    test_bars=40,
                    search=ParameterSearchConfig(
                        period_min=18,
                        period_max=20,
                        period_step=2,
                        stop_loss_min=7,
                        stop_loss_max=8,
                        stop_loss_step=1,
                        minimum_trades=0,
                    ),
                ),
            ),
            client=FakeModelClient(),
        )

    assert continued.status == "completed"
    assert continued.can_continue is False
    strategy = continued.tool_calls[0].result["data"]["strategy"]
    assert strategy["entry_ema_period"] == 20
    assert strategy["exit_ema_period"] == 5
    assert "用户补充（exit_action_missing）" in continued.user_prompt


def test_agent_rejects_incomplete_clarification_answers(client) -> None:
    request = CreateAgentRunRequest(
        prompt="MU 回踩 EMA20 买入。",
        data=BacktestDataConfig(mode="demo"),
    )

    with create_session(client.app.state.settings.database_url) as session:
        pending = run_quant_agent(
            session,
            client.app.state.settings,
            request,
            client=CompileOnlyModelClient(),
        )
        try:
            continue_quant_agent(
                session,
                client.app.state.settings,
                pending.run_id,
                ContinueAgentRunRequest(
                    answers={"exit_action_missing": "跌破 EMA5 卖出"},
                    data=BacktestDataConfig(mode="demo"),
                ),
                client=FakeModelClient(),
            )
        except Exception as exc:
            assert getattr(exc, "code", None) == "clarification_answers_missing"
        else:
            raise AssertionError("Missing clarification answer should be rejected")
