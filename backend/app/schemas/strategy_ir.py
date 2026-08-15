from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


StrategyTemplate = Literal[
    "ema_pullback",
    "ma_crossover",
    "momentum_breakout",
    "rsi_mean_reversion",
    "custom",
]
MarketField = Literal["open", "high", "low", "close", "volume"]
IndicatorKind = Literal["ema", "sma", "rsi", "rolling_max"]
ConditionOperator = Literal[
    "lt",
    "lte",
    "gt",
    "gte",
    "crosses_above",
    "crosses_below",
]


class IndicatorSpec(BaseModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    kind: IndicatorKind
    source: MarketField = "close"
    period: int = Field(ge=2, le=500)


class StrategyOperand(BaseModel):
    source: Literal["field", "indicator", "constant"]
    key: str | None = None
    value: float | None = None
    offset: Literal[-1, 0] = 0
    multiplier: float = Field(default=1, gt=0, le=100)

    @model_validator(mode="after")
    def validate_reference(self) -> "StrategyOperand":
        if self.source == "constant":
            if (
                self.value is None
                or self.key is not None
                or self.offset != 0
                or self.multiplier != 1
            ):
                raise ValueError(
                    "constant operands require value and cannot use key, offset, or multiplier"
                )
            return self
        if not self.key or self.value is not None:
            raise ValueError("field and indicator operands require key and cannot use value")
        if self.source == "field" and self.key not in {
            "open",
            "high",
            "low",
            "close",
            "volume",
        }:
            raise ValueError(f"unsupported market field: {self.key}")
        return self


class StrategyCondition(BaseModel):
    left: StrategyOperand
    operator: ConditionOperator
    right: StrategyOperand
    tolerance_bps: int = Field(default=0, ge=0, le=2_000)
    source_text: str | None = Field(default=None, min_length=1, max_length=240)

    @model_validator(mode="after")
    def validate_crossing_condition(self) -> "StrategyCondition":
        if self.operator.startswith("crosses_") and self.tolerance_bps:
            raise ValueError("crossing conditions do not support tolerance")
        return self


class ConditionGroup(BaseModel):
    mode: Literal["all", "any"]
    conditions: list[StrategyCondition] = Field(min_length=1, max_length=24)


class SignalRule(BaseModel):
    reason: str = Field(min_length=1, max_length=80)
    when: ConditionGroup


class PositionSizing(BaseModel):
    mode: Literal["target_cash_fraction"] = "target_cash_fraction"
    value: float = Field(gt=0, le=1)


class RiskRules(BaseModel):
    stop_loss_percent: float = Field(default=0, ge=0, le=50)


class ExecutionRules(BaseModel):
    signal_at: Literal["close"] = "close"
    fill_at: Literal["next_open"] = "next_open"
    direction: Literal["long_only"] = "long_only"
    max_positions: Literal[1] = 1


class StrategyIR(BaseModel):
    version: Literal["strategy-ir.v1"] = "strategy-ir.v1"
    name: str = Field(min_length=1, max_length=160)
    symbol: str = Field(min_length=1, max_length=16)
    timeframe: Literal["1d"] = "1d"
    template: StrategyTemplate
    indicators: list[IndicatorSpec] = Field(min_length=1, max_length=24)
    entry: SignalRule
    exit: SignalRule
    sizing: PositionSizing
    risk: RiskRules
    execution: ExecutionRules = Field(default_factory=ExecutionRules)

    @model_validator(mode="after")
    def validate_graph(self) -> "StrategyIR":
        indicator_ids = [item.id for item in self.indicators]
        if len(indicator_ids) != len(set(indicator_ids)):
            raise ValueError("indicator ids must be unique")
        known_indicators = set(indicator_ids)
        for rule in (self.entry, self.exit):
            for condition in rule.when.conditions:
                for operand in (condition.left, condition.right):
                    if operand.source == "indicator" and operand.key not in known_indicators:
                        raise ValueError(f"unknown indicator reference: {operand.key}")
        self.symbol = self.symbol.strip().upper()
        return self


class StrategyManifest(BaseModel):
    version: Literal["strategy-manifest.v1"] = "strategy-manifest.v1"
    ir_hash: str = Field(min_length=64, max_length=64)
    symbol: str
    timeframe: Literal["1d"] = "1d"
    required_fields: list[MarketField]
    indicator_ids: list[str]
    warmup_bars: int = Field(ge=2)
    max_lookback: int = Field(ge=2)
    signal_at: Literal["close"] = "close"
    fill_at: Literal["next_open"] = "next_open"
    direction: Literal["long_only"] = "long_only"
    lookahead_safe: Literal[True] = True
