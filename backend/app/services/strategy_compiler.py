from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.errors import StonksUpError
from app.schemas.backtests import (
    CompilationIssue,
    CompileStrategyRequest,
    StrategyCompilation,
    StrategyKind,
    StrategySpec,
)
from app.services.strategy_ir import build_strategy_ir, build_strategy_manifest


CONTRACT_VERSION = "strategy-ir.v1"
COMPILER_NAME = "deterministic-nl-to-ir.v1"
IGNORED_SYMBOL_TOKENS = {
    "AI", "EMA", "SMA", "MA", "RSI", "MACD", "USD", "BUY", "SELL", "HOLD",
}
BUY_WORDS = ("买入", "进场", "入场", "开仓", "做多", "buy", "enter", "open long")
SELL_WORDS = ("卖出", "离场", "出场", "平仓", "止盈", "sell", "exit", "close position")
PULLBACK_WORDS = ("跌到", "回踩", "触及", "触碰", "回落", "踩到", "踩住", "企稳", "near", "touch", "pullback")
CROSS_UP_WORDS = ("上穿", "金叉", "cross above", "crosses above")
CROSS_DOWN_WORDS = ("下穿", "死叉", "cross below", "crosses below")
BREAKOUT_WORDS = ("突破", "创", "新高", "breakout", "break above", "new high")

UNSUPPORTED_FEATURES: dict[str, tuple[str, ...]] = {
    "fundamental_data": ("财报", "营收", "利润", "毛利率", "市盈率", "PE", "EPS"),
    "news_or_sentiment": ("新闻", "舆情", "情绪", "公告", "社交媒体"),
    "volume_condition": ("成交量", "放量", "缩量", "换手率"),
    "short_selling": ("做空", "卖空", "空仓开仓"),
    "position_scaling": ("加仓", "减仓", "补仓", "分批买", "分批卖", "网格"),
    "take_profit": ("止盈", "盈利即卖", "盈利卖出"),
    "multi_asset": ("组合", "轮动", "多只股票", "一篮子"),
    "unsupported_indicator": ("MACD", "布林", "BOLL", "KDJ", "VWAP", "ATR"),
    "intraday": ("分钟", "小时", "盘前", "盘后", "分时"),
}


@dataclass(frozen=True)
class _KindEvidence:
    kind: StrategyKind
    score: int


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def _contains_any(text: str, tokens: tuple[str, ...]) -> bool:
    return any(token.lower() in text.lower() for token in tokens)


def _find_feature_token(text: str, tokens: tuple[str, ...]) -> str | None:
    for token in tokens:
        if token.isascii() and token.isalpha():
            if re.search(rf"\b{re.escape(token)}\b", text, re.IGNORECASE):
                return token
        elif token.lower() in text.lower():
            return token
    return None


def _normalize_prompt(prompt: str) -> str:
    normalized = prompt.strip().replace("，", ",").replace("；", ";")
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"均线(\d+)", r"MA\1", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(\d+)\s*(?:日|天)\s*(?:指数移动平均线|指数均线)", r"EMA\1", normalized)
    normalized = re.sub(r"(\d+)\s*(?:日|天)\s*(?:简单移动平均线|简单均线)", r"MA\1", normalized)
    normalized = re.sub(r"RSI\s*\(?\s*(\d+)\s*\)?", r"RSI\1", normalized, flags=re.IGNORECASE)
    return normalized


def _extract_symbol(prompt: str) -> tuple[str, bool]:
    candidates = [
        value.upper()
        for value in re.findall(r"\b[A-Za-z]{1,6}\b", prompt)
        if value.isupper()
    ]
    symbol = next(
        (candidate for candidate in candidates if candidate not in IGNORED_SYMBOL_TOKENS),
        None,
    )
    return (symbol or "MU", symbol is not None)


def _extract_number(prompt: str, patterns: list[str]) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            return float(match.group(1))
    return None


def _extract_indicator_periods(prompt: str, indicator: str) -> list[int]:
    if indicator == "EMA":
        pattern = r"EMA\s*[-_ ]?\s*(\d+)"
    elif indicator == "MA":
        pattern = r"(?:SMA|MA)\s*[-_ ]?\s*(\d+)"
    else:
        pattern = r"RSI\s*[-_ ]?\s*(\d+)"
    return [int(value) for value in re.findall(pattern, prompt, re.IGNORECASE)]


def _clauses(prompt: str) -> list[str]:
    return [item.strip() for item in re.split(r"[,;、。！？]|然后|并且|且|\band\b", prompt, flags=re.IGNORECASE) if item.strip()]


def _period_near_actions(prompt: str, indicator: str, actions: tuple[str, ...]) -> int | None:
    pattern = r"EMA\s*[-_ ]?\s*(\d+)" if indicator == "EMA" else r"(?:SMA|MA)\s*[-_ ]?\s*(\d+)"
    for clause in _clauses(prompt):
        if _contains_any(clause, actions):
            match = re.search(pattern, clause, re.IGNORECASE)
            if match:
                return int(match.group(1))
    return None


def _day_periods(prompt: str) -> list[int]:
    return [int(value) for value in re.findall(r"(\d+)\s*(?:个)?(?:交易)?(?:日|天)", prompt)]


def _rsi_threshold_near_action(
    prompt: str,
    actions: tuple[str, ...],
    comparisons: tuple[str, ...],
) -> float | None:
    comparison_pattern = "|".join(re.escape(item) for item in comparisons)
    for clause in _clauses(prompt):
        if not _contains_any(clause, actions):
            continue
        match = re.search(
            rf"(?:{comparison_pattern})\s*(\d+(?:\.\d+)?)",
            clause,
            re.IGNORECASE,
        )
        if match:
            return float(match.group(1))
    return None


def _kind_evidence(prompt: str) -> list[_KindEvidence]:
    upper = prompt.upper()
    evidence = [
        _KindEvidence(
            StrategyKind.EMA_PULLBACK,
            (3 if "EMA" in upper else 0) + (3 if _contains_any(prompt, PULLBACK_WORDS) else 0),
        ),
        _KindEvidence(
            StrategyKind.MA_CROSSOVER,
            (2 if re.search(r"(?:SMA|MA)\s*\d+|\d+\s*(?:日|天)?均线", prompt, re.I) else 0)
            + (4 if _contains_any(prompt, CROSS_UP_WORDS + CROSS_DOWN_WORDS) else 0),
        ),
        _KindEvidence(
            StrategyKind.MOMENTUM_BREAKOUT,
            (4 if _contains_any(prompt, BREAKOUT_WORDS) else 0)
            + (2 if _contains_any(prompt, ("最高价", "新高")) else 0),
        ),
        _KindEvidence(
            StrategyKind.RSI_MEAN_REVERSION,
            6 if "RSI" in upper else 0,
        ),
    ]
    return [item for item in evidence if item.score >= 4]


def _infer_kind(
    prompt: str,
    preferred_kind: StrategyKind | None,
) -> tuple[StrategyKind, list[CompilationIssue]]:
    evidence = _kind_evidence(prompt)
    issues: list[CompilationIssue] = []
    distinct = {item.kind for item in evidence}
    if len(distinct) > 1:
        issues.append(
            CompilationIssue(
                code="mixed_strategy_families",
                severity="unsupported",
                message="当前一次运行只支持一种策略骨架，检测到多个策略家族被组合使用。",
            )
        )
    if preferred_kind is not None:
        if distinct and preferred_kind not in distinct:
            issues.append(
                CompilationIssue(
                    code="template_conflict",
                    severity="clarification",
                    message="口述内容与所选策略模板冲突，请重新选择模板或修改描述。",
                )
            )
        return preferred_kind, issues
    if not evidence:
        issues.append(
            CompilationIssue(
                code="strategy_family_not_recognized",
                severity="unsupported",
                message="没有识别到受支持的 EMA 回踩、均线交叉、动量突破或 RSI 回归策略。",
            )
        )
        return StrategyKind.EMA_PULLBACK, issues
    return max(evidence, key=lambda item: item.score).kind, issues


def _unsupported_issues(prompt: str) -> list[CompilationIssue]:
    issues: list[CompilationIssue] = []
    for code, tokens in UNSUPPORTED_FEATURES.items():
        match = _find_feature_token(prompt, tokens)
        if match:
            issues.append(
                CompilationIssue(
                    code=code,
                    severity="unsupported",
                    message=f"当前回测引擎不支持条件“{match}”，已阻止执行以避免改变原策略。",
                    fragment=match,
                )
            )
    symbols = {
        value.upper()
        for value in re.findall(r"\b[A-Za-z]{1,6}\b", prompt)
        if value.isupper() and value.upper() not in IGNORED_SYMBOL_TOKENS
    }
    if len(symbols) > 1:
        issues.append(
            CompilationIssue(
                code="multiple_symbols",
                severity="unsupported",
                message="当前一次策略运行只支持一个交易标的。",
                fragment=", ".join(sorted(symbols)),
            )
        )
    return issues


def _core_issues(
    prompt: str,
    kind: StrategyKind,
    has_symbol: bool,
    entry_ema: int | None,
    exit_ema: int | None,
    fast_period: int | None,
    slow_period: int | None,
    lookback_period: int | None,
    rsi_period: int | None,
    rsi_entry: float | None,
    rsi_exit: float | None,
) -> list[CompilationIssue]:
    issues: list[CompilationIssue] = []
    if not has_symbol:
        issues.append(
            CompilationIssue(
                code="symbol_missing",
                severity="clarification",
                message="请明确股票代码，例如 MU、AAPL 或 QQQ。",
            )
        )
    has_buy = _contains_any(prompt, BUY_WORDS)
    has_sell = _contains_any(prompt, SELL_WORDS) or _contains_any(prompt, CROSS_DOWN_WORDS)
    if not has_buy:
        issues.append(CompilationIssue(code="entry_action_missing", severity="clarification", message="请明确何时买入或进场。"))
    if not has_sell:
        issues.append(CompilationIssue(code="exit_action_missing", severity="clarification", message="请明确何时卖出或离场。"))

    if kind == StrategyKind.EMA_PULLBACK:
        if entry_ema is None:
            issues.append(CompilationIssue(code="entry_ema_missing", severity="clarification", message="请明确回踩哪一条 EMA 作为入场条件。"))
        if exit_ema is None:
            issues.append(CompilationIssue(code="exit_ema_missing", severity="clarification", message="请明确跌破哪一条 EMA 作为离场条件。"))
    elif kind == StrategyKind.MA_CROSSOVER:
        if fast_period is None or slow_period is None:
            issues.append(CompilationIssue(code="ma_periods_missing", severity="clarification", message="请明确快线和慢线周期，例如 MA10 与 MA30。"))
        if not _contains_any(prompt, CROSS_UP_WORDS) or not _contains_any(prompt, CROSS_DOWN_WORDS):
            issues.append(CompilationIssue(code="ma_cross_actions_incomplete", severity="clarification", message="请同时明确金叉买入和死叉卖出规则。"))
    elif kind == StrategyKind.MOMENTUM_BREAKOUT:
        if lookback_period is None:
            issues.append(CompilationIssue(code="lookback_missing", severity="clarification", message="请明确突破过去多少日的最高价。"))
        if not re.search(r"跌破\s*(?:MA|SMA)?\s*20|跌破\s*20\s*(?:日|天)?均线", prompt, re.I):
            issues.append(CompilationIssue(code="breakout_exit_unsupported", severity="clarification", message="当前动量策略仅支持收盘跌破 MA20 离场，请明确该退出规则。"))
    else:
        if rsi_period is None:
            issues.append(CompilationIssue(code="rsi_period_missing", severity="clarification", message="请明确 RSI 周期，例如 RSI14。"))
        if rsi_entry is None or rsi_exit is None:
            issues.append(CompilationIssue(code="rsi_thresholds_missing", severity="clarification", message="请明确 RSI 买入和卖出阈值。"))
    return issues


def ensure_compilation_executable(compilation: StrategyCompilation) -> None:
    if compilation.executable:
        return
    raise StonksUpError(
        "strategy_compilation_blocked",
        "策略描述存在歧义或包含当前引擎不支持的条件，已阻止回测。",
        status_code=422,
        details={
            "status": compilation.status,
            "issues": [item.model_dump(mode="json") for item in compilation.issues],
        },
    )


def compile_strategy(request: CompileStrategyRequest) -> StrategyCompilation:
    prompt = request.prompt.strip()
    normalized = _normalize_prompt(prompt)
    kind, issues = _infer_kind(normalized, request.preferred_kind)
    issues.extend(_unsupported_issues(normalized))
    symbol, has_symbol = _extract_symbol(normalized)

    ema_periods = _extract_indicator_periods(normalized, "EMA")
    entry_ema = _period_near_actions(normalized, "EMA", BUY_WORDS)
    exit_ema = _period_near_actions(normalized, "EMA", SELL_WORDS)
    if entry_ema is None and len(ema_periods) == 1:
        entry_ema = ema_periods[0]
    if exit_ema is None and len(ema_periods) == 1 and _contains_any(normalized, SELL_WORDS):
        exit_ema = ema_periods[0]

    ma_periods = _extract_indicator_periods(normalized, "MA")
    day_periods = _day_periods(normalized)
    cross_periods = ma_periods or day_periods
    fast_period = min(cross_periods[:2]) if len(cross_periods) >= 2 else None
    slow_period = max(cross_periods[:2]) if len(cross_periods) >= 2 else None

    lookback = _extract_number(
        normalized,
        [r"(?:过去|此前|近)?\s*(\d+)\s*(?:个)?(?:交易)?(?:日|天)[^,;。]{0,10}(?:最高价|新高)", r"(\d+)\s*(?:日|天)?(?:新高|突破)"],
    )
    rsi_periods = _extract_indicator_periods(normalized, "RSI")
    rsi_period = rsi_periods[0] if rsi_periods else None
    rsi_entry = _rsi_threshold_near_action(
        normalized, BUY_WORDS, ("低于", "小于", "跌破", "<"),
    )
    rsi_exit = _rsi_threshold_near_action(
        normalized, SELL_WORDS, ("高于", "大于", "突破", ">"),
    )

    issues.extend(
        _core_issues(
            normalized, kind, has_symbol, entry_ema, exit_ema, fast_period,
            slow_period, int(lookback) if lookback is not None else None,
            rsi_period, rsi_entry, rsi_exit,
        )
    )
    unique_issues = list({item.code: item for item in issues}.values())
    status = (
        "unsupported"
        if any(item.severity == "unsupported" for item in unique_issues)
        else "needs_clarification"
        if unique_issues
        else "ready"
    )

    stop_loss = _extract_number(normalized, [r"(?:止损|亏损)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%", r"(\d+(?:\.\d+)?)\s*%\s*(?:止损|亏损即卖出)"])
    allocation = _extract_number(normalized, [r"(\d+(?:\.\d+)?)\s*%\s*(?:的)?(?:资金|仓位)", r"(?:仓位|资金)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%"])

    entry_ema_value = entry_ema or 5
    exit_ema_value = exit_ema or entry_ema_value
    fast_value = fast_period or 20
    slow_value = slow_period or 60
    lookback_value = int(lookback or 20)
    rsi_period_value = rsi_period or 14
    strategy = StrategySpec(
        name={
            StrategyKind.EMA_PULLBACK: f"{symbol} EMA{entry_ema_value}/{exit_ema_value} 回踩",
            StrategyKind.MA_CROSSOVER: f"{symbol} MA{fast_value}/{slow_value} 交叉",
            StrategyKind.MOMENTUM_BREAKOUT: f"{symbol} {lookback_value} 日动量突破",
            StrategyKind.RSI_MEAN_REVERSION: f"{symbol} RSI{rsi_period_value} 均值回归",
        }[kind],
        symbol=symbol,
        kind=kind,
        ema_period=max(2, min(entry_ema_value, 250)),
        entry_ema_period=max(2, min(entry_ema_value, 250)),
        exit_ema_period=max(2, min(exit_ema_value, 250)),
        fast_period=max(2, min(fast_value, 120)),
        slow_period=max(5, min(slow_value, 250)),
        lookback_period=max(5, min(lookback_value, 120)),
        rsi_period=max(5, min(rsi_period_value, 40)),
        rsi_entry=_clamp(rsi_entry if rsi_entry is not None else 30, 1, 49),
        rsi_exit=_clamp(rsi_exit if rsi_exit is not None else 55, 50, 99),
        stop_loss_percent=_clamp(stop_loss if stop_loss is not None else 8, 0, 50),
        allocation_percent=_clamp(allocation if allocation is not None else 95, 1, 100),
    )

    interpretations = {
        StrategyKind.EMA_PULLBACK: [
            f"前一交易日收盘位于 EMA{strategy.entry_ema_period} 上方，当日最低价触及该 EMA 且收盘重新站上时产生买入信号。",
            f"收盘价从上向下有效跌破 EMA{strategy.exit_ema_period} 时产生卖出信号。",
        ],
        StrategyKind.MA_CROSSOVER: [
            f"MA{strategy.fast_period} 上穿 MA{strategy.slow_period} 时产生买入信号。",
            f"MA{strategy.fast_period} 下穿 MA{strategy.slow_period} 时产生卖出信号。",
        ],
        StrategyKind.MOMENTUM_BREAKOUT: [
            f"收盘价突破此前 {strategy.lookback_period} 个交易日最高价时产生买入信号。",
            "持仓后收盘价跌破 MA20 时产生卖出信号。",
        ],
        StrategyKind.RSI_MEAN_REVERSION: [
            f"RSI{strategy.rsi_period} 低于 {strategy.rsi_entry:g} 时产生买入信号。",
            f"RSI{strategy.rsi_period} 高于 {strategy.rsi_exit:g} 时产生卖出信号。",
        ],
    }[kind]
    assumptions = [
        "所有指标只使用当前及过去已经完成的日线数据。",
        "信号在收盘后确认，订单在下一交易日开盘成交。",
        "仅做多，同一标的同时最多持有一个方向的仓位。",
    ]
    warnings: list[str] = []
    if stop_loss is None:
        warnings.append("未指定保护止损；仅在策略可执行后采用 8% 默认止损。")
    if allocation is None:
        warnings.append("未指定仓位；仅在策略可执行后采用 95% 默认值。")
    confidence = max(0.15, 0.98 - len(unique_issues) * 0.18 - len(warnings) * 0.02)
    strategy_ir = build_strategy_ir(strategy)

    return StrategyCompilation(
        prompt=prompt,
        normalized_prompt=normalized,
        strategy=strategy,
        status=status,
        executable=status == "ready",
        interpretation=[
            *interpretations,
            f"保护性止损 {strategy.stop_loss_percent:g}%，每次最多使用 {strategy.allocation_percent:g}% 可用资金。",
        ],
        assumptions=assumptions,
        warnings=warnings,
        issues=unique_issues,
        confidence=confidence,
        contract_version=CONTRACT_VERSION,
        compiler=COMPILER_NAME,
        strategy_ir=strategy_ir,
        manifest=build_strategy_manifest(strategy_ir),
    )
