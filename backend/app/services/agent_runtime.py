from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from time import perf_counter
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.errors import StonksUpError
from app.models import AgentModelCall, AgentRun, AgentStep, AgentToolCall
from app.schemas.agent_runs import (
    AgentClarificationQuestion,
    AgentModelCallView,
    AgentRunDetail,
    AgentRunHistory,
    AgentRunSummary,
    AgentStepView,
    AgentToolCallView,
    ContinueAgentRunRequest,
    CreateAgentRunRequest,
)
from app.schemas.backtests import CompileStrategyRequest, StrategyCompilation
from app.services.backtest_analysis import enrich_backtest_result
from app.services.backtest_data import apply_data_provenance, load_backtest_data
from app.services.backtest_engine import run_backtest
from app.services.backtest_persistence import persist_backtest
from app.services.llm_provider import DeepSeekClient, ModelClient
from app.services.market_data import get_daily_bar_models
from app.services.strategy_compiler import compile_strategy, ensure_compilation_executable
from app.services.walk_forward import run_walk_forward
from app.services.walk_forward_persistence import persist_walk_forward


SYSTEM_PROMPT = """你是 StonksUp 的量化研究编排 Agent。
你的职责是理解用户目标、按需调用工具、检查证据并解释结果。
所有收益、回撤、指标和样本外结果必须来自工具，禁止自行编造或计算。
默认流程：编译策略、检查行情缓存、运行单次回测、运行样本外验证、给出结论；用户明确排除某一步时可跳过。
compile_strategy 必须忠实处理用户原文，不得改写、删除或弱化任何交易条件。
如果编译结果 executable=false，必须停止调用后续工具，逐条说明 issues，并请用户补充或改写策略。
最终回答必须区分：计算事实、风险判断、仍需验证的限制。使用中文，简洁具体。
如果工具返回错误，说明原因并尝试使用已有工具恢复，不得声称工具已经成功。
"""


TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "compile_strategy",
            "description": "把本次任务中的用户原始策略描述编译成可执行、可审计的策略契约。必须首先调用。",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_data_status",
            "description": "检查已编译策略标的与独立基准的持久化行情覆盖范围。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_backtest",
            "description": "用确定性引擎运行单次回测，返回收益、风险、基准和数据质量摘要。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_walk_forward",
            "description": "运行滚动样本外验证和参数搜索，返回过拟合诊断摘要。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


CLARIFICATION_COPY: dict[str, tuple[str, str]] = {
    "symbol_missing": (
        "你要回测哪个交易标的？",
        "例如：MU、AAPL 或 QQQ",
    ),
    "entry_action_missing": (
        "什么条件触发买入或进场？",
        "例如：盘中触碰 EMA20 且收盘重新站稳后买入",
    ),
    "exit_action_missing": (
        "什么条件触发卖出或离场？",
        "例如：收盘跌破 EMA5 时卖出",
    ),
    "entry_ema_missing": (
        "回踩哪一条 EMA 作为入场条件？",
        "例如：EMA20",
    ),
    "exit_ema_missing": (
        "跌破哪一条 EMA 作为离场条件？",
        "例如：EMA5",
    ),
    "ma_periods_missing": (
        "均线交叉使用哪两个周期？",
        "例如：MA10 和 MA30",
    ),
    "ma_cross_actions_incomplete": (
        "金叉和死叉分别执行什么动作？",
        "例如：金叉买入，死叉卖出",
    ),
    "lookback_missing": (
        "价格突破过去多少个交易日的最高价时进场？",
        "例如：过去 20 个交易日",
    ),
    "breakout_exit_unsupported": (
        "动量突破后使用什么离场规则？",
        "当前支持：收盘跌破 MA20 时卖出",
    ),
    "rsi_period_missing": (
        "RSI 使用多长周期？",
        "例如：RSI14",
    ),
    "rsi_thresholds_missing": (
        "RSI 低于多少买入，高于多少卖出？",
        "例如：RSI14 低于 30 买入，高于 70 卖出",
    ),
    "template_conflict": (
        "口述策略和所选模板冲突，请确认要使用哪一种策略？",
        "请完整描述一种策略的入场和离场规则",
    ),
}


@dataclass
class _AgentContext:
    session: Session
    settings: Settings
    request: CreateAgentRunRequest
    run: AgentRun
    compilation: StrategyCompilation | None = None


def _clarification_questions(
    compilation: StrategyCompilation,
) -> list[AgentClarificationQuestion]:
    questions: list[AgentClarificationQuestion] = []
    for issue in compilation.issues:
        if issue.severity != "clarification":
            continue
        question, hint = CLARIFICATION_COPY.get(
            issue.code,
            (issue.message, "请补充一条明确、可执行的规则"),
        )
        questions.append(
            AgentClarificationQuestion(
                code=issue.code,
                question=question,
                answer_hint=hint,
            )
        )
    return questions


def _compilation_report(compilation: StrategyCompilation) -> str:
    if compilation.status == "needs_clarification":
        questions = _clarification_questions(compilation)
        lines = [
            "## 需要你补充信息",
            "",
            "策略尚未达到可执行状态，因此没有调用行情、回测或样本外验证工具。",
            "",
        ]
        lines.extend(
            f"{index}. **{item.question}** 参考：{item.answer_hint}"
            for index, item in enumerate(questions, start=1)
        )
        lines.extend(["", "补充后，Harness 会把原始描述与回答合并并重新编译。"])
        return "\n".join(lines)

    lines = [
        "## 当前策略无法执行",
        "",
        "策略包含当前确定性回测引擎不支持的条件，已停止后续工具调用：",
        "",
    ]
    lines.extend(
        f"- **{issue.code}**：{issue.message}"
        for issue in compilation.issues
        if issue.severity == "unsupported"
    )
    lines.extend(["", "请删除这些条件，或改写为当前支持的四类策略之一。"])
    return "\n".join(lines)


def _compilation_payload(row: AgentRun) -> dict[str, Any] | None:
    compile_call = next(
        (item for item in row.tool_calls if item.tool_name == "compile_strategy"),
        None,
    )
    if compile_call is None or not compile_call.result.get("success"):
        return None
    data = compile_call.result.get("data")
    return data if isinstance(data, dict) else None


def _require_compilation(context: _AgentContext) -> StrategyCompilation:
    if context.compilation is None:
        raise ValueError("compile_strategy must be called before this tool")
    return context.compilation


def _compact_backtest(result) -> dict[str, Any]:
    return {
        "run_id": result.run_id,
        "symbol": result.symbol,
        "as_of": result.as_of,
        "strategy_return": result.total_return,
        "annualized_return": result.annualized_return,
        "asset_buy_hold_return": result.asset_return,
        "benchmark_symbol": result.benchmark_symbol,
        "benchmark_return": result.benchmark_return,
        "excess_return": result.excess_return,
        "max_drawdown": result.max_drawdown,
        "sharpe_ratio": result.sharpe_ratio,
        "calmar_ratio": result.calmar_ratio,
        "trade_count": result.trade_count,
        "win_rate": result.win_rate,
        "data_quality": result.data_quality.status if result.data_quality else "unknown",
        "data_warnings": [item for item in result.audit if item.startswith("WARN")],
    }


def _execute_tool(context: _AgentContext, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "compile_strategy":
        context.compilation = compile_strategy(
            CompileStrategyRequest(prompt=context.request.prompt)
        )
        strategy = context.compilation.strategy
        context.run.symbol = strategy.symbol
        return {
            "contract_version": context.compilation.contract_version,
            "compiler": context.compilation.compiler,
            "status": context.compilation.status,
            "executable": context.compilation.executable,
            "confidence": context.compilation.confidence,
            "normalized_prompt": context.compilation.normalized_prompt,
            "strategy": strategy.model_dump(mode="json"),
            "interpretation": context.compilation.interpretation,
            "assumptions": context.compilation.assumptions,
            "warnings": context.compilation.warnings,
            "issues": [item.model_dump(mode="json") for item in context.compilation.issues],
            "clarification_questions": [
                item.model_dump(mode="json")
                for item in _clarification_questions(context.compilation)
            ],
        }

    compilation = _require_compilation(context)
    ensure_compilation_executable(compilation)
    strategy = compilation.strategy
    data = context.request.data
    if name == "get_market_data_status":
        status: dict[str, Any] = {
            "mode": data.mode,
            "adjustment": data.adjustment,
            "requested_start": data.start_date.isoformat(),
            "requested_end": data.end_date.isoformat(),
            "symbols": [],
        }
        for symbol in dict.fromkeys([strategy.symbol, data.benchmark_symbol]):
            rows = (
                get_daily_bar_models(
                    context.session,
                    symbol,
                    data.start_date,
                    min(data.end_date, datetime.now(UTC).date()),
                    data.adjustment,
                )
                if data.mode == "real"
                else []
            )
            status["symbols"].append(
                {
                    "symbol": symbol,
                    "cached_bars": len(rows),
                    "actual_start": rows[0].trading_date.isoformat() if rows else None,
                    "actual_end": rows[-1].trading_date.isoformat() if rows else None,
                }
            )
        return status

    loaded = load_backtest_data(context.session, context.settings, strategy, data, 756)
    if name == "run_backtest":
        result = run_backtest(loaded.rows, strategy, context.request.config)
        result = enrich_backtest_result(result, loaded, context.request.config)
        result = apply_data_provenance(result, loaded)
        persist_backtest(
            context.session,
            prompt=context.request.prompt,
            strategy_spec=strategy,
            config=context.request.config,
            data=data,
            result=result,
        )
        return _compact_backtest(result)

    if name == "run_walk_forward":
        execution = run_walk_forward(
            loaded,
            strategy,
            context.request.config,
            context.request.validation,
        )
        persist_walk_forward(
            context.session,
            prompt=context.request.prompt,
            strategy_spec=strategy,
            config=context.request.config,
            data=data,
            validation=context.request.validation,
            execution=execution,
        )
        result = execution.result
        return {
            "experiment_id": result.experiment_id,
            "symbol": result.symbol,
            "window_count": result.window_count,
            "candidate_count": result.candidate_count,
            "objective": result.objective,
            "sample_out_return": result.aggregate.total_return,
            "annualized_return": result.aggregate.annualized_return,
            "asset_buy_hold_return": result.aggregate.asset_return,
            "benchmark_return": result.aggregate.benchmark_return,
            "max_drawdown": result.aggregate.max_drawdown,
            "sharpe_ratio": result.aggregate.sharpe_ratio,
            "calmar_ratio": result.aggregate.calmar_ratio,
            "trade_count": result.aggregate.trade_count,
            "parameter_stability": result.aggregate.parameter_stability,
            "overfitting_risk": result.overfitting_risk,
            "warnings": result.warnings,
            "data_quality": result.data_quality.status,
        }
    raise ValueError(f"Unknown tool: {name}")


def _summary(row: AgentRun) -> AgentRunSummary:
    compilation = _compilation_payload(row)
    questions = (
        compilation.get("clarification_questions", [])
        if compilation is not None
        else []
    )
    return AgentRunSummary(
        run_id=row.run_key,
        status=row.status,
        provider=row.provider,
        model=row.model,
        user_prompt=row.user_prompt,
        symbol=row.symbol,
        current_step=row.current_step,
        final_output=row.final_output,
        error_message=row.error_message,
        created_at=row.created_at,
        completed_at=row.completed_at,
        step_count=len(row.steps),
        tool_call_count=len(row.tool_calls),
        model_call_count=len(row.model_calls),
        clarification_questions=questions,
        can_continue=row.status == "needs_clarification" and bool(questions),
    )


def _detail(row: AgentRun) -> AgentRunDetail:
    return AgentRunDetail(
        **_summary(row).model_dump(),
        steps=[AgentStepView.model_validate(item, from_attributes=True) for item in row.steps],
        tool_calls=[AgentToolCallView.model_validate(item, from_attributes=True) for item in row.tool_calls],
        model_calls=[AgentModelCallView.model_validate(item, from_attributes=True) for item in row.model_calls],
    )


def _load_run(session: Session, run_key: str) -> AgentRun | None:
    return session.scalar(
        select(AgentRun)
        .where(AgentRun.run_key == run_key)
        .options(
            selectinload(AgentRun.steps),
            selectinload(AgentRun.tool_calls),
            selectinload(AgentRun.model_calls),
        )
    )


def get_agent_runs(session: Session, limit: int) -> AgentRunHistory:
    rows = session.scalars(
        select(AgentRun)
        .options(
            selectinload(AgentRun.steps),
            selectinload(AgentRun.tool_calls),
            selectinload(AgentRun.model_calls),
        )
        .order_by(AgentRun.created_at.desc())
        .limit(limit)
    ).all()
    return AgentRunHistory(runs=[_summary(row) for row in rows])


def get_agent_run(session: Session, run_key: str) -> AgentRunDetail:
    row = _load_run(session, run_key)
    if row is None:
        raise StonksUpError("agent_run_not_found", "Agent run was not found.", status_code=404)
    return _detail(row)


def continue_quant_agent(
    session: Session,
    settings: Settings,
    run_key: str,
    request: ContinueAgentRunRequest,
    *,
    client: ModelClient | None = None,
) -> AgentRunDetail:
    previous = _load_run(session, run_key)
    if previous is None:
        raise StonksUpError("agent_run_not_found", "Agent run was not found.", status_code=404)
    compilation = _compilation_payload(previous)
    questions = compilation.get("clarification_questions", []) if compilation else []
    if previous.status != "needs_clarification" or not questions:
        raise StonksUpError(
            "agent_run_not_awaiting_clarification",
            "This agent run is not waiting for clarification.",
            status_code=409,
        )

    cleaned_answers = {
        code: answer.strip()
        for code, answer in request.answers.items()
        if answer.strip()
    }
    required_codes = [str(item["code"]) for item in questions]
    missing = [code for code in required_codes if code not in cleaned_answers]
    if missing:
        raise StonksUpError(
            "clarification_answers_missing",
            "Please answer every clarification question before continuing.",
            status_code=422,
            details={"missing_codes": missing},
        )

    additions = "\n".join(
        f"- 用户补充（{code}）：{cleaned_answers[code]}"
        for code in required_codes
    )
    combined_prompt = f"{previous.user_prompt.rstrip()}\n\n{additions}"
    follow_up = CreateAgentRunRequest(
        prompt=combined_prompt,
        data=request.data,
        config=request.config,
        validation=request.validation,
    )
    return run_quant_agent(session, settings, follow_up, client=client)


def run_quant_agent(
    session: Session,
    settings: Settings,
    request: CreateAgentRunRequest,
    *,
    client: ModelClient | None = None,
) -> AgentRunDetail:
    if client is None:
        if settings.deepseek_api_key is None:
            raise StonksUpError(
                "agent_not_configured",
                "DeepSeek API key is not configured.",
                status_code=503,
            )
        client = DeepSeekClient(
            settings.deepseek_api_key.get_secret_value(),
            settings.deepseek_base_url,
            settings.deepseek_model,
            settings.agent_model_timeout_seconds,
        )

    now = datetime.now(UTC)
    run = AgentRun(
        run_key=f"AR-{uuid4().hex[:12].upper()}",
        status="running",
        provider=client.provider,
        model=client.model,
        user_prompt=request.prompt,
        current_step="planning",
        started_at=now,
    )
    session.add(run)
    session.commit()
    context = _AgentContext(session=session, settings=settings, request=request, run=run)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.prompt},
    ]

    try:
        for turn in range(1, settings.agent_max_turns + 1):
            run.current_step = "model"
            model_started = perf_counter()
            response = client.complete(messages, TOOLS)
            model_duration = int((perf_counter() - model_started) * 1_000)
            run.model_calls.append(
                AgentModelCall(
                    sequence=turn,
                    provider=client.provider,
                    model=client.model,
                    status="completed",
                    input_messages=len(messages),
                    input_tokens=response.usage.input_tokens,
                    output_tokens=response.usage.output_tokens,
                    duration_ms=model_duration,
                    finish_reason=response.finish_reason,
                    output_summary=(response.content or "")[:1_000] or None,
                )
            )
            assistant_message: dict[str, Any] = {
                "role": "assistant",
                "content": response.content,
            }
            if response.tool_calls:
                assistant_message["tool_calls"] = response.tool_calls
            messages.append(assistant_message)

            if not response.tool_calls:
                if not response.content:
                    raise ValueError("Model returned neither content nor tool calls")
                run.status = "completed"
                run.current_step = "complete"
                run.final_output = response.content
                run.completed_at = datetime.now(UTC)
                session.commit()
                loaded = _load_run(session, run.run_key)
                assert loaded is not None
                return _detail(loaded)

            for raw_call in response.tool_calls:
                function = raw_call.get("function") or {}
                name = str(function.get("name") or "")
                call_id = str(raw_call.get("id") or uuid4().hex)
                tool_started = perf_counter()
                step = AgentStep(
                    sequence=len(run.steps) + 1,
                    name=name or "invalid_tool_call",
                    status="running",
                    started_at=datetime.now(UTC),
                )
                run.steps.append(step)
                run.current_step = step.name
                try:
                    arguments = json.loads(function.get("arguments") or "{}")
                    if not isinstance(arguments, dict):
                        raise ValueError("Tool arguments must be a JSON object")
                except (TypeError, ValueError, json.JSONDecodeError) as exc:
                    arguments = {}
                    error_message = str(exc)
                    tool_result = {"success": False, "error": error_message}
                    status = "failed"
                else:
                    try:
                        output = _execute_tool(context, name, arguments)
                        tool_result = {"success": True, "data": output}
                        status = "completed"
                        error_message = None
                    except (StonksUpError, ValueError) as exc:
                        message = exc.message if isinstance(exc, StonksUpError) else str(exc)
                        tool_result = {"success": False, "error": message}
                        status = "failed"
                        error_message = message
                duration = int((perf_counter() - tool_started) * 1_000)
                step.status = status
                step.summary = (
                    f"{name} completed in {duration} ms"
                    if status == "completed"
                    else error_message
                )
                step.completed_at = datetime.now(UTC)
                run.tool_calls.append(
                    AgentToolCall(
                        sequence=len(run.tool_calls) + 1,
                        call_id=call_id,
                        tool_name=name or "invalid_tool_call",
                        status=status,
                        arguments=arguments,
                        result=tool_result,
                        duration_ms=duration,
                        error_message=error_message,
                    )
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                    }
                )
                if (
                    name == "compile_strategy"
                    and context.compilation is not None
                    and not context.compilation.executable
                ):
                    break
            session.commit()

            if context.compilation is not None and not context.compilation.executable:
                run.status = context.compilation.status
                run.current_step = (
                    "awaiting_clarification"
                    if context.compilation.status == "needs_clarification"
                    else "blocked"
                )
                run.final_output = _compilation_report(context.compilation)
                run.completed_at = datetime.now(UTC)
                session.commit()
                loaded = _load_run(session, run.run_key)
                assert loaded is not None
                return _detail(loaded)

        raise ValueError("Agent exceeded the maximum number of model turns")
    except Exception as exc:
        run.status = "failed"
        run.current_step = "failed"
        run.error_message = exc.message if isinstance(exc, StonksUpError) else str(exc)
        run.completed_at = datetime.now(UTC)
        session.commit()
        if isinstance(exc, StonksUpError):
            raise
        raise StonksUpError(
            "agent_run_failed",
            "The quant research agent could not complete the run.",
            status_code=502,
            details={"run_id": run.run_key, "reason": run.error_message},
        ) from exc
