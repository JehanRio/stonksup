import json

from app.db.session import create_session
from app.schemas.agent_runs import CreateAgentRunRequest
from app.schemas.backtests import BacktestDataConfig
from app.schemas.walk_forward import ParameterSearchConfig, WalkForwardConfig
from app.services.agent_runtime import get_agent_run, get_agent_runs, run_quant_agent
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
    assert persisted.final_output == result.final_output
    assert history.runs[0].run_id == result.run_id


def test_agent_capability_reports_missing_key(client) -> None:
    response = client.get("/api/v1/agent-runs/capabilities")
    body = response.json()["data"]

    assert response.status_code == 200
    assert body["provider"] == "deepseek"
    assert body["configured"] is False
    assert "run_backtest" in body["tools"]
