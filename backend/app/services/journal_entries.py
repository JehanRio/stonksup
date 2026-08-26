from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import StonksUpError
from app.models import JournalEntry, JournalTrade
from app.schemas.journal_entries import JournalEntryCollection, JournalEntryPayload, JournalEntryView, JournalTradePayload


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _sync_trades(row: JournalEntry, trades: list[JournalTradePayload]) -> None:
    existing = {trade.id: trade for trade in row.trades}
    wanted = {trade.id for trade in trades}
    row.trades[:] = [trade for trade in row.trades if trade.id in wanted]
    for payload in trades:
        trade = existing.get(payload.id)
        if trade is None:
            trade = JournalTrade(id=payload.id)
            row.trades.append(trade)
        trade.symbol = payload.symbol.strip().upper()
        trade.side = payload.side
        trade.executed_at = payload.executed_at
        trade.price = payload.price
        trade.quantity = payload.quantity
        trade.planned = payload.planned
        trade.note = payload.note


def _apply_payload(row: JournalEntry, payload: JournalEntryPayload, *, include_plan: bool) -> None:
    row.status = payload.status
    if include_plan:
        row.market_phase = payload.market_phase
        row.market_notes = payload.market_notes
        row.focus = payload.focus
        row.targets = payload.targets
        row.trade_plan = payload.trade_plan
        row.max_daily_loss_pct = payload.max_daily_loss_pct
    row.market_outcome = payload.market_outcome
    row.execution_notes = payload.execution_notes
    row.daily_summary = payload.daily_summary
    row.plan_adherence = payload.plan_adherence
    row.lessons = payload.lessons
    row.next_improvement = payload.next_improvement
    row.postmarket_completed_at = payload.postmarket_completed_at
    row.ai_review = payload.ai_review
    row.ai_updated_at = payload.ai_updated_at
    row.client_updated_at = payload.updated_at
    _sync_trades(row, payload.trades)


def _to_view(row: JournalEntry) -> JournalEntryView:
    return JournalEntryView(
        date=row.entry_date, status=row.status, market_phase=row.market_phase,
        market_notes=row.market_notes, focus=row.focus, targets=row.targets,
        trade_plan=row.trade_plan, max_daily_loss_pct=row.max_daily_loss_pct,
        market_outcome=row.market_outcome, execution_notes=row.execution_notes,
        daily_summary=row.daily_summary, plan_adherence=row.plan_adherence,
        lessons=row.lessons, next_improvement=row.next_improvement,
        postmarket_completed_at=row.postmarket_completed_at,
        trades=[JournalTradePayload(
            id=trade.id, symbol=trade.symbol, side=trade.side, executed_at=trade.executed_at,
            price=trade.price, quantity=trade.quantity, planned=trade.planned, note=trade.note,
        ) for trade in row.trades],
        ai_review=row.ai_review, ai_updated_at=row.ai_updated_at,
        updated_at=row.client_updated_at, saved_at=row.updated_at,
        plan_is_locked=row.plan_is_locked, plan_locked_at=row.plan_locked_at,
        plan_revision=row.plan_revision, plan_history=row.plan_history or [],
        ai_evidence=row.ai_evidence or [],
    )


def _find(session: Session, entry_date) -> JournalEntry | None:
    return session.scalar(select(JournalEntry).options(selectinload(JournalEntry.trades)).where(JournalEntry.entry_date == entry_date))


def _upsert(session: Session, payload: JournalEntryPayload) -> JournalEntry:
    row = _find(session, payload.date)
    if row is None:
        row = JournalEntry(entry_date=payload.date, client_updated_at=payload.updated_at)
        session.add(row)
        _apply_payload(row, payload, include_plan=True)
        session.flush()
        return row
    if _as_utc(payload.updated_at) >= _as_utc(row.client_updated_at):
        _apply_payload(row, payload, include_plan=not row.plan_is_locked)
        session.flush()
    return row


def list_journal_entries(session: Session) -> JournalEntryCollection:
    rows = session.scalars(select(JournalEntry).options(selectinload(JournalEntry.trades)).order_by(JournalEntry.entry_date.asc())).all()
    return JournalEntryCollection(entries=[_to_view(row) for row in rows])


def sync_journal_entries(session: Session, payloads: list[JournalEntryPayload]) -> JournalEntryCollection:
    for payload in payloads:
        _upsert(session, payload)
    session.commit()
    return list_journal_entries(session)


def _validate_date(entry_date: str, payload: JournalEntryPayload) -> None:
    if str(payload.date) != entry_date:
        raise StonksUpError("journal_date_mismatch", "Journal entry date does not match the request path.", details={"path_date": entry_date, "payload_date": str(payload.date)})


def upsert_journal_entry(session: Session, entry_date: str, payload: JournalEntryPayload) -> JournalEntryView:
    _validate_date(entry_date, payload)
    row = _upsert(session, payload)
    session.commit()
    session.refresh(row)
    return _to_view(row)


def lock_journal_plan(session: Session, entry_date: str, payload: JournalEntryPayload) -> JournalEntryView:
    _validate_date(entry_date, payload)
    row = _upsert(session, payload)
    if not row.plan_is_locked:
        locked_at = datetime.now(UTC)
        revision = row.plan_revision + 1
        row.plan_history = [*(row.plan_history or []), {
            "revision": revision, "locked_at": locked_at.isoformat(),
            "market_phase": row.market_phase, "market_notes": row.market_notes,
            "focus": row.focus, "targets": row.targets, "trade_plan": row.trade_plan,
            "max_daily_loss_pct": str(row.max_daily_loss_pct) if row.max_daily_loss_pct is not None else None,
        }]
        row.plan_revision = revision
        row.plan_is_locked = True
        row.plan_locked_at = locked_at
    session.commit()
    session.refresh(row)
    return _to_view(row)


def unlock_journal_plan(session: Session, entry_date: str) -> JournalEntryView:
    row = _find(session, entry_date)
    if row is None:
        raise StonksUpError("journal_not_found", "Journal entry was not found.")
    row.plan_is_locked = False
    session.commit()
    session.refresh(row)
    return _to_view(row)
