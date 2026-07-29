from __future__ import annotations

import re

from app.schemas.backtests import (
    CompileStrategyRequest,
    StrategyCompilation,
    StrategyKind,
    StrategySpec,
)


CONTRACT_VERSION = "strategy-dsl.v0.2"
COMPILER_NAME = "deterministic-nl-compiler.v1"
IGNORED_SYMBOL_TOKENS = {
    "AI",
    "EMA",
    "SMA",
    "RSI",
    "MACD",
    "USD",
    "BUY",
    "SELL",
    "HOLD",
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def _extract_symbol(prompt: str) -> tuple[str, bool]:
    candidates = re.findall(r"\b[A-Za-z]{1,6}\b", prompt.upper())
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


def _extract_day_periods(prompt: str) -> list[int]:
    return [
        int(match)
        for match in re.findall(r"(\d+)\s*(?:个)?(?:交易)?日", prompt)
    ]


def _infer_kind(prompt: str, preferred_kind: StrategyKind | None) -> StrategyKind:
    if preferred_kind is not None:
        return preferred_kind

    upper_prompt = prompt.upper()
    is_pullback = any(token in prompt for token in ("跌到", "回踩", "触及", "触碰"))
    if "EMA" in upper_prompt and is_pullback:
        return StrategyKind.EMA_PULLBACK
    if "RSI" in upper_prompt:
        return StrategyKind.RSI_MEAN_REVERSION
    if "突破" in prompt and "均线" not in prompt and "EMA" not in upper_prompt:
        return StrategyKind.MOMENTUM_BREAKOUT
    return StrategyKind.MA_CROSSOVER


def compile_strategy(request: CompileStrategyRequest) -> StrategyCompilation:
    prompt = request.prompt.strip()
    kind = _infer_kind(prompt, request.preferred_kind)
    symbol, has_explicit_symbol = _extract_symbol(prompt)
    day_periods = _extract_day_periods(prompt)

    ema_period = int(
        _extract_number(
            prompt,
            [
                r"EMA\s*[-_ ]?\s*(\d+)",
                r"(\d+)\s*(?:个)?(?:交易)?日\s*(?:EMA|指数(?:移动)?均线)",
            ],
        )
        or 5
    )
    stop_loss_value = _extract_number(
        prompt,
        [
            r"(?:止损|亏损|回撤)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%",
            r"(\d+(?:\.\d+)?)\s*%\s*(?:止损|亏损即卖出)",
        ],
    )
    allocation_value = _extract_number(
        prompt,
        [
            r"(\d+(?:\.\d+)?)\s*%\s*(?:的)?(?:资金|仓位)",
            r"(?:仓位|资金)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%",
        ],
    )
    rsi_entry = _extract_number(prompt, [r"(?:RSI)?[^\d]{0,8}低于\s*(\d+(?:\.\d+)?)"])
    rsi_exit = _extract_number(prompt, [r"(?:RSI)?[^\d]{0,8}高于\s*(\d+(?:\.\d+)?)"])

    fast_period = day_periods[0] if day_periods else 20
    slow_period = day_periods[1] if len(day_periods) > 1 else 60
    if fast_period >= slow_period:
        fast_period = max(2, slow_period // 3)

    names = {
        StrategyKind.EMA_PULLBACK: f"{symbol} EMA{ema_period} 回踩",
        StrategyKind.MA_CROSSOVER: f"{symbol} 均线趋势",
        StrategyKind.MOMENTUM_BREAKOUT: f"{symbol} 动量突破",
        StrategyKind.RSI_MEAN_REVERSION: f"{symbol} RSI 均值回归",
    }
    strategy = StrategySpec(
        name=names[kind],
        symbol=symbol,
        kind=kind,
        ema_period=max(2, min(ema_period, 250)),
        fast_period=max(2, min(fast_period, 120)),
        slow_period=max(5, min(slow_period, 250)),
        lookback_period=max(5, min(day_periods[0] if day_periods else 20, 120)),
        rsi_period=max(5, min(day_periods[0] if day_periods else 14, 40)),
        rsi_entry=_clamp(rsi_entry or 30, 1, 49),
        rsi_exit=_clamp(rsi_exit or 55, 50, 99),
        stop_loss_percent=_clamp(stop_loss_value if stop_loss_value is not None else 8, 0, 50),
        allocation_percent=_clamp(allocation_value or 95, 1, 100),
    )

    interpretations: dict[StrategyKind, list[str]] = {
        StrategyKind.EMA_PULLBACK: [
            (
                f"前一交易日收盘位于 EMA{strategy.ema_period} 上方，"
                f"当日最低价触及 EMA{strategy.ema_period} 且收盘重新站在均线上方时产生买入信号。"
            ),
            (
                f"收盘价从上向下有效跌破 EMA{strategy.ema_period} 时产生卖出信号。"
            ),
        ],
        StrategyKind.MA_CROSSOVER: [
            (
                f"{strategy.fast_period} 日简单均线上穿 {strategy.slow_period} 日简单均线时"
                "产生买入信号。"
            ),
            (
                f"{strategy.fast_period} 日简单均线下穿 {strategy.slow_period} 日简单均线时"
                "产生卖出信号。"
            ),
        ],
        StrategyKind.MOMENTUM_BREAKOUT: [
            (
                f"收盘价突破此前 {strategy.lookback_period} 个交易日最高价时"
                "产生买入信号。"
            ),
            "持仓后收盘价跌破 20 日简单均线时产生卖出信号。",
        ],
        StrategyKind.RSI_MEAN_REVERSION: [
            (
                f"{strategy.rsi_period} 日 RSI 低于 {strategy.rsi_entry:g} 时"
                "产生买入信号。"
            ),
            f"RSI 高于 {strategy.rsi_exit:g} 时产生卖出信号。",
        ],
    }

    assumptions = [
        "所有指标只使用当前及过去已经完成的日线数据。",
        "信号在收盘后确认，订单在下一交易日开盘成交。",
        "仅做多，同一标的同时最多持有一个方向的仓位。",
    ]
    warnings: list[str] = []

    if kind == StrategyKind.EMA_PULLBACK:
        assumptions.append("“跌到/回踩”解释为盘中触及 EMA、但收盘守住 EMA；“跌破”指收盘下穿同一条 EMA。")
    if not has_explicit_symbol:
        assumptions.append("原描述未识别到标的代码，本次默认使用 MU。")
    if stop_loss_value is None:
        warnings.append("原描述未指定保护性止损，本次采用 8% 默认止损。")
    if allocation_value is None:
        warnings.append("原描述未指定仓位，本次每次最多使用 95% 可用资金。")

    interpretation = [
        *interpretations[kind],
        (
            f"保护性止损 {strategy.stop_loss_percent:g}%，"
            f"每次最多使用 {strategy.allocation_percent:g}% 可用资金。"
        ),
    ]
    confidence = 0.94 if has_explicit_symbol else 0.86
    if kind == StrategyKind.EMA_PULLBACK and "跌破" not in prompt:
        confidence -= 0.08
        warnings.append("原描述没有明确退出条件，当前采用收盘跌破同一条 EMA 退出。")

    return StrategyCompilation(
        prompt=prompt,
        strategy=strategy,
        interpretation=interpretation,
        assumptions=assumptions,
        warnings=warnings,
        confidence=confidence,
        contract_version=CONTRACT_VERSION,
        compiler=COMPILER_NAME,
    )
