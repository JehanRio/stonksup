from __future__ import annotations

import hashlib
import json

from app.schemas.backtests import StrategyKind, StrategySpec
from app.schemas.strategy_ir import (
    ConditionGroup,
    ExecutionRules,
    IndicatorSpec,
    PositionSizing,
    RiskRules,
    SignalRule,
    StrategyCondition,
    StrategyIR,
    StrategyManifest,
    StrategyOperand,
    StrategySearchParameter,
)


def _field(key: str, *, offset: int = 0) -> StrategyOperand:
    return StrategyOperand(source="field", key=key, offset=offset)


def _indicator(key: str, *, offset: int = 0) -> StrategyOperand:
    return StrategyOperand(source="indicator", key=key, offset=offset)


def _constant(value: float) -> StrategyOperand:
    return StrategyOperand(source="constant", value=value)


def _condition(
    left: StrategyOperand,
    operator: str,
    right: StrategyOperand,
    *,
    tolerance_bps: int = 0,
) -> StrategyCondition:
    return StrategyCondition(
        left=left,
        operator=operator,
        right=right,
        tolerance_bps=tolerance_bps,
    )


def ensure_search_parameters(
    strategy_ir: StrategyIR,
    *,
    replace: bool = False,
) -> StrategyIR:
    if strategy_ir.search_parameters and not replace:
        return strategy_ir

    referenced_ids = [
        operand.key
        for condition in strategy_ir.entry.when.conditions
        for operand in (condition.left, condition.right)
        if operand.source == "indicator" and operand.key is not None
    ]
    primary = next(
        (
            indicator
            for indicator_id in referenced_ids
            for indicator in strategy_ir.indicators
            if indicator.id == indicator_id
        ),
        strategy_ir.indicators[0],
    )
    label = f"{primary.kind.upper()}({primary.source}) 周期"
    return strategy_ir.model_copy(
        update={
            "search_parameters": [
                StrategySearchParameter(
                    id=f"{primary.id}_period",
                    label=label,
                    indicator_id=primary.id,
                )
            ]
        },
        deep=True,
    )


def build_strategy_ir(strategy: StrategySpec) -> StrategyIR:
    indicators: list[IndicatorSpec]
    entry: SignalRule
    exit_rule: SignalRule

    if strategy.kind == StrategyKind.EMA_PULLBACK:
        indicators = [
            IndicatorSpec(
                id="entry_ema",
                kind="ema",
                source="close",
                period=strategy.entry_ema_period,
            ),
            IndicatorSpec(
                id="exit_ema",
                kind="ema",
                source="close",
                period=strategy.exit_ema_period,
            ),
        ]
        entry = SignalRule(
            reason="ema_pullback_hold",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(
                        _field("close", offset=-1),
                        "gt",
                        _indicator("entry_ema", offset=-1),
                    ),
                    _condition(
                        _field("low"),
                        "lte",
                        _indicator("entry_ema"),
                        tolerance_bps=strategy.touch_tolerance_bps,
                    ),
                    _condition(_field("close"), "gte", _indicator("entry_ema")),
                ],
            ),
        )
        exit_rule = SignalRule(
            reason="ema_close_cross_down",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(
                        _field("close"),
                        "crosses_below",
                        _indicator("exit_ema"),
                    )
                ],
            ),
        )
    elif strategy.kind == StrategyKind.MA_CROSSOVER:
        indicators = [
            IndicatorSpec(
                id="fast_sma",
                kind="sma",
                source="close",
                period=strategy.fast_period,
            ),
            IndicatorSpec(
                id="slow_sma",
                kind="sma",
                source="close",
                period=strategy.slow_period,
            ),
        ]
        entry = SignalRule(
            reason="ma_cross_up",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(
                        _indicator("fast_sma"),
                        "crosses_above",
                        _indicator("slow_sma"),
                    )
                ],
            ),
        )
        exit_rule = SignalRule(
            reason="ma_cross_down",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(
                        _indicator("fast_sma"),
                        "crosses_below",
                        _indicator("slow_sma"),
                    )
                ],
            ),
        )
    elif strategy.kind == StrategyKind.MOMENTUM_BREAKOUT:
        indicators = [
            IndicatorSpec(
                id="prior_high",
                kind="rolling_max",
                source="high",
                period=strategy.lookback_period,
            ),
            IndicatorSpec(id="exit_sma", kind="sma", source="close", period=20),
        ]
        entry = SignalRule(
            reason="momentum_breakout",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(
                        _field("close"),
                        "gt",
                        _indicator("prior_high", offset=-1),
                    )
                ],
            ),
        )
        exit_rule = SignalRule(
            reason="trend_exit",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(_field("close"), "lt", _indicator("exit_sma"))
                ],
            ),
        )
    elif strategy.kind == StrategyKind.RSI_MEAN_REVERSION:
        indicators = [
            IndicatorSpec(
                id="rsi",
                kind="rsi",
                source="close",
                period=strategy.rsi_period,
            )
        ]
        entry = SignalRule(
            reason="rsi_oversold",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(_indicator("rsi"), "lt", _constant(strategy.rsi_entry))
                ],
            ),
        )
        exit_rule = SignalRule(
            reason="rsi_reversion",
            when=ConditionGroup(
                mode="all",
                conditions=[
                    _condition(_indicator("rsi"), "gt", _constant(strategy.rsi_exit))
                ],
            ),
        )
    else:
        raise ValueError("custom_ir strategies require an explicit Strategy IR")

    return ensure_search_parameters(
        StrategyIR(
            name=strategy.name,
            symbol=strategy.symbol,
            timeframe=strategy.timeframe,
            template=strategy.kind.value,
            indicators=indicators,
            entry=entry,
            exit=exit_rule,
            sizing=PositionSizing(value=strategy.allocation_percent / 100),
            risk=RiskRules(stop_loss_percent=strategy.stop_loss_percent),
            execution=ExecutionRules(
                signal_at=strategy.signal_at,
                fill_at=strategy.fill_at,
                direction="long_only",
                max_positions=1,
            ),
        )
    )


def strategy_ir_hash(strategy_ir: StrategyIR) -> str:
    payload = json.dumps(
        strategy_ir.model_dump(mode="json"),
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def build_strategy_manifest(strategy_ir: StrategyIR) -> StrategyManifest:
    required_fields = {"open", "high", "low", "close"}
    for indicator in strategy_ir.indicators:
        required_fields.add(indicator.source)
    for rule in (strategy_ir.entry, strategy_ir.exit):
        for condition in rule.when.conditions:
            for operand in (condition.left, condition.right):
                if operand.source == "field" and operand.key:
                    required_fields.add(operand.key)

    max_lookback = max(indicator.period for indicator in strategy_ir.indicators)
    uses_previous_value = any(
        operand.offset == -1 or condition.operator.startswith("crosses_")
        for rule in (strategy_ir.entry, strategy_ir.exit)
        for condition in rule.when.conditions
        for operand in (condition.left, condition.right)
    )
    return StrategyManifest(
        ir_hash=strategy_ir_hash(strategy_ir),
        symbol=strategy_ir.symbol,
        timeframe=strategy_ir.timeframe,
        required_fields=sorted(required_fields),
        indicator_ids=[item.id for item in strategy_ir.indicators],
        warmup_bars=max_lookback + (1 if uses_previous_value else 0),
        max_lookback=max_lookback,
        signal_at=strategy_ir.execution.signal_at,
        fill_at=strategy_ir.execution.fill_at,
        direction=strategy_ir.execution.direction,
        lookahead_safe=True,
    )
