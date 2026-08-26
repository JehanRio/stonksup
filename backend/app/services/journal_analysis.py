from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.errors import StonksUpError
from app.models import JournalEntry
from app.schemas.journal_entries import JournalAnalysisResult, JournalMarketEvidence
from app.schemas.market_data import MarketDataSyncRequest
from app.services.llm_provider import DeepSeekClient
from app.services.market_data import get_daily_bar_models, sync_daily_bars


SYMBOL_ALIASES = {
    "MODERNA": "MRNA",
    "莫德纳": "MRNA",
}
SYMBOL_STOPWORDS = {"AI", "ETF", "BUY", "SELL", "LONG", "SHORT", "USD"}


def _extract_symbols(row: JournalEntry) -> list[str]:
    symbols = [trade.symbol.strip().upper() for trade in row.trades if trade.symbol.strip()]
    target_text = " ".join((row.targets, row.trade_plan, row.execution_notes)).upper()
    for alias, symbol in SYMBOL_ALIASES.items():
        if alias in target_text:
            symbols.append(symbol)
        target_text = target_text.replace(alias, " ")
    for token in re.findall(r"(?<![A-Z])[A-Z]{1,5}(?![A-Z])", target_text):
        if token not in SYMBOL_STOPWORDS:
            symbols.append(token)
    return list(dict.fromkeys(symbols))[:6]


def _ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    value = sum(values[:period]) / period
    multiplier = 2 / (period + 1)
    for price in values[period:]:
        value = (price - value) * multiplier + value
    return round(value, 4)


def _atr(rows, period: int = 14) -> float | None:
    if len(rows) < period + 1:
        return None
    ranges: list[float] = []
    for previous, current in zip(rows[-period - 1:-1], rows[-period:]):
        high, low, previous_close = float(current.high), float(current.low), float(previous.close)
        ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
    return round(sum(ranges) / len(ranges), 4)


def _build_evidence(symbol: str, rows) -> JournalMarketEvidence:
    latest = rows[-1]
    closes = [float(row.close) for row in rows]
    recent = rows[-20:]
    previous_close = float(rows[-2].close) if len(rows) > 1 else None
    change = ((float(latest.close) / previous_close) - 1) * 100 if previous_close else None
    volumes = [float(row.volume) for row in recent[:-1] if row.volume]
    average_volume = sum(volumes) / len(volumes) if volumes else None
    volume_ratio = float(latest.volume) / average_volume if average_volume and latest.volume else None
    return JournalMarketEvidence(
        symbol=symbol,
        as_of=latest.trading_date,
        close=round(float(latest.close), 4),
        day_change_pct=round(change, 2) if change is not None else None,
        ema20=_ema(closes, 20),
        atr14=_atr(rows),
        high_20d=round(max(float(row.high) for row in recent), 4) if recent else None,
        low_20d=round(min(float(row.low) for row in recent), 4) if recent else None,
        volume_ratio_20d=round(volume_ratio, 2) if volume_ratio is not None else None,
    )


def analyze_journal_entry(
    session: Session,
    settings: Settings,
    entry_date: str,
) -> JournalAnalysisResult:
    try:
        parsed_date = date.fromisoformat(entry_date)
    except ValueError as exc:
        raise StonksUpError("journal_date_invalid", "Journal entry date is invalid.") from exc
    row = session.scalar(
        select(JournalEntry)
        .options(selectinload(JournalEntry.trades))
        .where(JournalEntry.entry_date == parsed_date)
    )
    if row is None:
        raise StonksUpError("journal_not_found", "Journal entry was not found.", status_code=404)
    symbols = _extract_symbols(row)
    if not symbols:
        raise StonksUpError(
            "journal_symbols_missing",
            "请先在目标个股或交易执行中填写至少一个股票代码。",
        )
    if not settings.deepseek_api_key:
        raise StonksUpError("journal_ai_not_configured", "AI 分析服务尚未配置。", status_code=503)

    evidence: list[JournalMarketEvidence] = []
    warnings: list[str] = []
    market_end = min(parsed_date, datetime.now(UTC).date())
    market_start = market_end - timedelta(days=140)
    for symbol in symbols:
        try:
            sync_daily_bars(session, settings, MarketDataSyncRequest(
                symbol=symbol, start_date=market_start, end_date=market_end,
                adjustment="all", force=True,
            ))
            rows = get_daily_bar_models(session, symbol, market_start, market_end, "all")
            if not rows:
                warnings.append(f"{symbol} 没有可用行情")
                continue
            evidence.append(_build_evidence(symbol, rows))
        except StonksUpError as exc:
            warnings.append(f"{symbol} 行情获取失败：{exc.message}")

    if not evidence:
        raise StonksUpError(
            "journal_market_evidence_unavailable",
            "相关标的的最新行情暂时无法获取，未生成无证据分析。",
            status_code=503,
            details={"warnings": warnings},
        )

    trades = [{
        "symbol": trade.symbol, "side": trade.side,
        "executed_at": trade.executed_at.isoformat() if trade.executed_at else None,
        "price": str(trade.price) if isinstance(trade.price, Decimal) else trade.price,
        "quantity": str(trade.quantity) if isinstance(trade.quantity, Decimal) else trade.quantity,
        "planned": trade.planned, "note": trade.note,
    } for trade in row.trades]
    journal = {
        "date": str(row.entry_date), "market_phase": row.market_phase,
        "market_notes": row.market_notes, "focus": row.focus, "targets": row.targets,
        "trade_plan": row.trade_plan,
        "max_daily_loss_pct": str(row.max_daily_loss_pct) if row.max_daily_loss_pct is not None else None,
        "trades": trades, "execution_notes": row.execution_notes,
        "market_outcome": row.market_outcome, "daily_summary": row.daily_summary,
        "plan_adherence": row.plan_adherence, "lessons": row.lessons,
        "next_improvement": row.next_improvement,
    }
    evidence_json = [item.model_dump(mode="json") for item in evidence]
    prompt = f"""请分析下面这篇交易日记。只使用所给日记和行情证据，不得编造新闻、盘中价格或基本面事实。

日记：{json.dumps(journal, ensure_ascii=False)}
行情证据（Twelve Data 日线复权数据）：{json.dumps(evidence_json, ensure_ascii=False)}

必须用中文并严格包含以下小节：
## 结论
## 盘前判断与实际执行
## 逐笔交易点评
## 参考交易点位
## 下一交易日行动清单

要求：
1. 明确区分数据事实、基于数据的推断和日记中缺失的信息。
2. 每个行情数字都写明对应代码和 as_of 日期，不能把日线收盘价说成实时价。
3. “参考交易点位”必须逐个标的给出观察/入场区、失效或止损位、减仓/止盈观察位，并说明它们如何由 close、EMA20、ATR14、20日高低点推导；若证据不足就明确说不足。
4. 将真实成交与锁定的盘前计划对照；没有逐笔成交时直接指出无法评价成交质量。
5. 不因单笔盈亏倒推决策对错，不承诺收益。
"""
    client = DeepSeekClient(
        settings.deepseek_api_key.get_secret_value(), settings.deepseek_base_url,
        settings.deepseek_model, settings.agent_model_timeout_seconds,
    )
    response = client.complete(
        [{"role": "system", "content": "你是严谨的交易复盘分析师，所有判断必须可追溯到给定证据。"},
         {"role": "user", "content": prompt}],
        [],
    )
    analysis = (response.content or "").strip()
    if not analysis:
        raise StonksUpError("journal_ai_empty", "AI 分析服务返回了空结果。", status_code=502)
    generated_at = datetime.now(UTC)
    row.ai_review = analysis
    row.ai_evidence = evidence_json
    row.ai_updated_at = generated_at
    session.commit()
    return JournalAnalysisResult(
        analysis=analysis, generated_at=generated_at, evidence=evidence, warnings=warnings
    )
