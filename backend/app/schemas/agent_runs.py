from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.backtests import BacktestConfig, BacktestDataConfig
from app.schemas.walk_forward import WalkForwardConfig


class CreateAgentRunRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=4_000)
    data: BacktestDataConfig = Field(
        default_factory=lambda: BacktestDataConfig(mode="real")
    )
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    validation: WalkForwardConfig = Field(default_factory=WalkForwardConfig)


class ContinueAgentRunRequest(BaseModel):
    answers: dict[str, str] = Field(min_length=1)
    data: BacktestDataConfig = Field(
        default_factory=lambda: BacktestDataConfig(mode="real")
    )
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    validation: WalkForwardConfig = Field(default_factory=WalkForwardConfig)


class AgentClarificationQuestion(BaseModel):
    code: str
    question: str
    answer_hint: str


class AgentCapability(BaseModel):
    provider: Literal["deepseek"] = "deepseek"
    configured: bool
    model: str
    tools: list[str]
    message: str


class AgentStepView(BaseModel):
    sequence: int
    name: str
    status: str
    summary: str | None
    started_at: datetime
    completed_at: datetime | None


class AgentToolCallView(BaseModel):
    sequence: int
    call_id: str
    tool_name: str
    status: str
    arguments: dict[str, Any]
    result: dict[str, Any]
    duration_ms: int
    error_message: str | None
    created_at: datetime


class AgentModelCallView(BaseModel):
    sequence: int
    provider: str
    model: str
    status: str
    input_messages: int
    input_tokens: int
    output_tokens: int
    duration_ms: int
    finish_reason: str | None
    output_summary: str | None
    error_message: str | None
    created_at: datetime


class AgentRunSummary(BaseModel):
    run_id: str
    status: str
    provider: str
    model: str
    user_prompt: str
    symbol: str | None
    current_step: str
    final_output: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    step_count: int
    tool_call_count: int
    model_call_count: int
    clarification_questions: list[AgentClarificationQuestion] = Field(default_factory=list)
    can_continue: bool = False


class AgentRunDetail(AgentRunSummary):
    steps: list[AgentStepView]
    tool_calls: list[AgentToolCallView]
    model_calls: list[AgentModelCallView]


class AgentRunHistory(BaseModel):
    runs: list[AgentRunSummary]
