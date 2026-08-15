from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.core.errors import StonksUpError
from app.schemas.backtests import (
    CompileStrategyRequest,
    StrategyCompilation,
    StrategyKind,
    StrategySpec,
)
from app.schemas.strategy_ir import StrategyCondition, StrategyIR, StrategyOperand
from app.services.llm_provider import ModelClient
from app.services.strategy_compiler import (
    BUY_WORDS,
    CONTRACT_VERSION,
    SELL_WORDS,
    compile_strategy,
)
from app.services.strategy_ir import build_strategy_manifest


AI_COMPILER_VERSION = "llm-to-strategy-ir.v1"
SUBMIT_IR_TOOL_NAME = "submit_strategy_ir"
AI_OVERRIDABLE_ISSUES = {
    "mixed_strategy_families",
    "volume_condition",
}
COMMON_CLARIFICATION_ISSUES = {
    "symbol_missing",
    "entry_action_missing",
    "exit_action_missing",
}

AI_IR_SYSTEM_PROMPT = """你是 StonksUp 的 Strategy IR 编译器，不是投资顾问。
将用户策略忠实转换成 submit_strategy_ir 工具参数。不得删除、弱化或自行添加交易条件。

可用指标：ema、sma、rsi、rolling_max。
可用字段：open、high、low、close、volume。
可用比较：lt、lte、gt、gte、crosses_above、crosses_below。
条件组只支持一层 all 或 any。只支持日线、仅做多、收盘确认、下一交易日开盘成交。
template 必须为 custom。

每个 condition.source_text 必须逐字复制用户原文中支持该条件的完整片段，并包含对应的买入或卖出动作。
不得用解释、改写或同义句代替原文证据。
如果用户没有给出标的、入场或离场规则，不得猜测；直接用普通文本提出一个简短澄清问题，不要调用工具。
如果策略包含财报、新闻、做空、加减仓、止盈、多标的、分钟级或未支持指标，不要调用工具，直接说明当前不支持。

没有指定仓位时 sizing.value 使用 0.95；没有指定保护止损时 stop_loss_percent 使用 0。
使用 multiplier 表达倍数，例如 1.5 倍成交量均线应设置右操作数 multiplier=1.5。
指标 id 使用简短 snake_case，并确保每个 indicator 引用都存在。
"""


def strategy_ir_submission_tool(
    *,
    name: str = SUBMIT_IR_TOOL_NAME,
    description: str = "提交忠实、可执行且带原文证据的 Strategy IR。",
    required: bool = True,
) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy_ir": StrategyIR.model_json_schema(),
                },
                "required": ["strategy_ir"] if required else [],
                "additionalProperties": False,
            },
        },
    }


def _evidence_is_verbatim(prompt: str, fragment: str | None) -> bool:
    if not fragment:
        return False
    normalized_prompt = re.sub(r"\s+", " ", prompt).strip().casefold()
    normalized_fragment = re.sub(r"\s+", " ", fragment).strip().casefold()
    return normalized_fragment in normalized_prompt


def _operand_dimension(
    operand: StrategyOperand,
    strategy_ir: StrategyIR,
) -> str:
    if operand.source == "constant":
        return "scalar"
    if operand.source == "field":
        return "volume" if operand.key == "volume" else "price"
    indicator = next(item for item in strategy_ir.indicators if item.id == operand.key)
    if indicator.kind == "rsi":
        return "oscillator"
    return "volume" if indicator.source == "volume" else "price"


def _condition_text(condition: StrategyCondition) -> str:
    return condition.source_text or "<missing evidence>"


def _validate_condition_dimensions(
    condition: StrategyCondition,
    strategy_ir: StrategyIR,
) -> None:
    left = _operand_dimension(condition.left, strategy_ir)
    right = _operand_dimension(condition.right, strategy_ir)
    if left != "scalar" and right != "scalar" and left != right:
        raise ValueError(
            f"condition compares incompatible dimensions {left} and {right}: "
            f"{_condition_text(condition)}"
        )


def _assert_prompt_concept_coverage(prompt: str, strategy_ir: StrategyIR) -> None:
    upper = prompt.upper()
    indicators = strategy_ir.indicators
    for period in {int(value) for value in re.findall(r"EMA\s*(\d+)", upper)}:
        if not any(item.kind == "ema" and item.period == period for item in indicators):
            raise ValueError(f"prompt mentions EMA{period}, but the IR does not declare it")
    for period in {int(value) for value in re.findall(r"(?:SMA|(?<!E)MA)\s*(\d+)", upper)}:
        if not any(item.kind == "sma" and item.period == period for item in indicators):
            raise ValueError(f"prompt mentions MA{period}, but the IR does not declare it")
    for period in {int(value) for value in re.findall(r"RSI\s*\(?\s*(\d+)", upper)}:
        if not any(item.kind == "rsi" and item.period == period for item in indicators):
            raise ValueError(f"prompt mentions RSI{period}, but the IR does not declare it")
    if re.search(r"成交量|放量|缩量|\bvolume\b", prompt, re.IGNORECASE):
        uses_volume = any(item.source == "volume" for item in indicators) or any(
            operand.source == "field" and operand.key == "volume"
            for rule in (strategy_ir.entry, strategy_ir.exit)
            for condition in rule.when.conditions
            for operand in (condition.left, condition.right)
        )
        if not uses_volume:
            raise ValueError("prompt mentions volume, but the IR has no volume dependency")

    referenced_indicator_ids = {
        operand.key
        for rule in (strategy_ir.entry, strategy_ir.exit)
        for condition in rule.when.conditions
        for operand in (condition.left, condition.right)
        if operand.source == "indicator"
    }
    for indicator in indicators:
        if indicator.id not in referenced_indicator_ids:
            raise ValueError(f"IR declares unused indicator {indicator.id}")
        if indicator.kind == "ema":
            pattern = rf"EMA\s*{indicator.period}\b"
        elif indicator.kind == "rsi":
            pattern = rf"RSI\s*\(?\s*{indicator.period}\b"
        elif indicator.kind == "rolling_max":
            pattern = rf"(?:过去|近)?\s*{indicator.period}\s*(?:日|天).*(?:最高|新高)"
        elif indicator.source == "volume":
            pattern = rf"{indicator.period}\s*(?:日|天).*(?:均量|成交量)"
        else:
            pattern = rf"(?:SMA|(?<!E)MA)\s*{indicator.period}\b|{indicator.period}\s*日均线"
        if re.search(pattern, prompt, re.IGNORECASE) is None:
            raise ValueError(
                f"IR indicator {indicator.id} ({indicator.kind}{indicator.period}) "
                "is not grounded in the prompt"
            )


def _extract_prompt_number(prompt: str, patterns: list[str]) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            return float(match.group(1))
    return None


def _assert_risk_and_sizing_coverage(prompt: str, strategy_ir: StrategyIR) -> None:
    stop_loss = _extract_prompt_number(
        prompt,
        [
            r"(?:止损|亏损)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%",
            r"(\d+(?:\.\d+)?)\s*%\s*(?:止损|亏损即卖出)",
        ],
    )
    expected_stop = stop_loss if stop_loss is not None else 0
    if abs(strategy_ir.risk.stop_loss_percent - expected_stop) > 1e-9:
        raise ValueError(
            "IR stop loss does not match the prompt or the zero-stop default"
        )

    allocation = _extract_prompt_number(
        prompt,
        [
            r"(\d+(?:\.\d+)?)\s*%\s*(?:的)?(?:资金|仓位)",
            r"(?:仓位|资金)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%",
        ],
    )
    expected_sizing = (allocation if allocation is not None else 95) / 100
    if abs(strategy_ir.sizing.value - expected_sizing) > 1e-9:
        raise ValueError(
            "IR position sizing does not match the prompt or the 95% default"
        )


def validate_ai_strategy_ir(prompt: str, strategy_ir: StrategyIR) -> None:
    if strategy_ir.template != "custom":
        raise ValueError("AI-generated Strategy IR must use the custom template")
    for indicator in strategy_ir.indicators:
        if indicator.kind == "rsi" and indicator.source != "close":
            raise ValueError("RSI currently supports close as its source")

    for label, rule, action_words in (
        ("entry", strategy_ir.entry, BUY_WORDS),
        ("exit", strategy_ir.exit, SELL_WORDS),
    ):
        evidence_fragments: list[str] = []
        for condition in rule.when.conditions:
            if not _evidence_is_verbatim(prompt, condition.source_text):
                raise ValueError(
                    f"{label} condition source_text is missing or is not verbatim user text"
                )
            evidence_fragments.append(condition.source_text or "")
            _validate_condition_dimensions(condition, strategy_ir)
        evidence = " ".join(evidence_fragments).casefold()
        if not any(word.casefold() in evidence for word in action_words):
            raise ValueError(f"{label} evidence does not include its trading action")

    _assert_prompt_concept_coverage(prompt, strategy_ir)
    _assert_risk_and_sizing_coverage(prompt, strategy_ir)


def _format_operand(operand: StrategyOperand) -> str:
    if operand.source == "constant":
        return f"{operand.value:g}"
    value = (operand.key or "unknown").upper()
    if operand.offset == -1:
        value += "[前一日]"
    if operand.multiplier != 1:
        value = f"{operand.multiplier:g} × {value}"
    return value


def _format_condition(condition: StrategyCondition) -> str:
    operator = {
        "lt": "<",
        "lte": "<=",
        "gt": ">",
        "gte": ">=",
        "crosses_above": "上穿",
        "crosses_below": "下穿",
    }[condition.operator]
    tolerance = (
        f"，容差 {condition.tolerance_bps} bps" if condition.tolerance_bps else ""
    )
    return f"{_format_operand(condition.left)} {operator} {_format_operand(condition.right)}{tolerance}"


def compile_strategy_ir_candidate(
    prompt: str,
    candidate: dict[str, Any],
    *,
    compiler: str = AI_COMPILER_VERSION,
) -> StrategyCompilation:
    baseline = compile_strategy(CompileStrategyRequest(prompt=prompt))
    hard_issues = [
        issue for issue in baseline.issues if issue.code not in AI_OVERRIDABLE_ISSUES
    ]
    if any(issue.severity == "unsupported" for issue in hard_issues):
        return baseline
    if any(issue.code in COMMON_CLARIFICATION_ISSUES for issue in hard_issues):
        return baseline

    try:
        strategy_ir = StrategyIR.model_validate(candidate)
        validate_ai_strategy_ir(prompt, strategy_ir)
        if strategy_ir.symbol != baseline.strategy.symbol:
            raise ValueError(
                f"IR symbol {strategy_ir.symbol} does not match prompt symbol "
                f"{baseline.strategy.symbol}"
            )
    except (ValidationError, ValueError) as exc:
        details = exc.errors() if isinstance(exc, ValidationError) else [{"msg": str(exc)}]
        raise StonksUpError(
            "ai_strategy_ir_rejected",
            "AI 生成的策略规则未通过安全校验，已阻止执行。",
            status_code=422,
            details={"reason": details},
        ) from exc

    strategy = StrategySpec(
        name=strategy_ir.name,
        symbol=strategy_ir.symbol,
        kind=StrategyKind.CUSTOM_IR,
        stop_loss_percent=strategy_ir.risk.stop_loss_percent,
        allocation_percent=strategy_ir.sizing.value * 100,
    )
    entry_joiner = " 且 " if strategy_ir.entry.when.mode == "all" else " 或 "
    exit_joiner = " 且 " if strategy_ir.exit.when.mode == "all" else " 或 "
    warnings = ["该规则由模型生成并通过确定性 Harness 校验；运行前请核对 IR 预览。"]
    if strategy_ir.risk.stop_loss_percent == 0:
        warnings.append("原文未提供保护止损，当前 IR 不启用额外止损。")

    return StrategyCompilation(
        prompt=prompt,
        strategy=strategy,
        status="ready",
        executable=True,
        interpretation=[
            "入场：" + entry_joiner.join(
                _format_condition(item) for item in strategy_ir.entry.when.conditions
            ),
            "离场：" + exit_joiner.join(
                _format_condition(item) for item in strategy_ir.exit.when.conditions
            ),
            (
                f"保护性止损 {strategy_ir.risk.stop_loss_percent:g}%，"
                f"每次最多使用 {strategy_ir.sizing.value * 100:g}% 可用资金。"
            ),
        ],
        assumptions=[
            "所有指标只使用当前及过去已经完成的日线数据。",
            "信号在收盘后确认，订单在下一交易日开盘成交。",
            "仅做多，同一标的同时最多持有一个方向的仓位。",
        ],
        warnings=warnings,
        issues=[],
        normalized_prompt=re.sub(r"\s+", " ", prompt).strip(),
        confidence=0.88,
        contract_version=CONTRACT_VERSION,
        compiler=compiler,
        strategy_ir=strategy_ir,
        manifest=build_strategy_manifest(strategy_ir),
    )


def compile_strategy_with_model(
    prompt: str,
    client: ModelClient,
) -> StrategyCompilation:
    baseline = compile_strategy(CompileStrategyRequest(prompt=prompt))
    hard_issues = [
        issue for issue in baseline.issues if issue.code not in AI_OVERRIDABLE_ISSUES
    ]
    if any(issue.severity == "unsupported" for issue in hard_issues):
        return baseline
    if any(issue.code in COMMON_CLARIFICATION_ISSUES for issue in hard_issues):
        return baseline

    response = client.complete(
        [
            {"role": "system", "content": AI_IR_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        [strategy_ir_submission_tool()],
    )
    call = next(
        (
            item
            for item in response.tool_calls
            if (item.get("function") or {}).get("name") == SUBMIT_IR_TOOL_NAME
        ),
        None,
    )
    if call is None:
        raise StonksUpError(
            "ai_strategy_ir_missing",
            response.content or "模型没有提交可执行的 Strategy IR。",
            status_code=422,
        )
    try:
        arguments = json.loads((call.get("function") or {}).get("arguments") or "{}")
        candidate = arguments["strategy_ir"]
        if not isinstance(candidate, dict):
            raise TypeError("strategy_ir must be an object")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise StonksUpError(
            "ai_strategy_ir_invalid_response",
            "模型返回的 Strategy IR 不是有效 JSON 对象。",
            status_code=502,
        ) from exc
    return compile_strategy_ir_candidate(
        prompt,
        candidate,
        compiler=f"{client.provider}-{client.model}-to-ir.v1",
    )
