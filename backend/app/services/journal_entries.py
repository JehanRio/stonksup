from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import StonksUpError
from app.models import JournalEntry
from app.schemas.journal_entries import (
    JournalEntryCollection,
    JournalEntryPayload,
    JournalEntryView,
)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _apply_payload(row: JournalEntry, payload: JournalEntryPayload) -> None:
    row.status = payload.status
    row.market_phase = payload.market_phase
    row.market_notes = payload.market_notes
    row.focus = payload.focus
    row.targets = payload.targets
    row.trade_plan = payload.trade_plan
    row.daily_summary = payload.daily_summary
    row.ai_review = payload.ai_review
    row.ai_updated_at = payload.ai_updated_at
    row.client_updated_at = payload.updated_at


def _to_view(row: JournalEntry) -> JournalEntryView:
    return JournalEntryView(
        date=row.entry_date,
        status=row.status,
        market_phase=row.market_phase,
        market_notes=row.market_notes,
        focus=row.focus,
        targets=row.targets,
        trade_plan=row.trade_plan,
        daily_summary=row.daily_summary,
        ai_review=row.ai_review,
        ai_updated_at=row.ai_updated_at,
        updated_at=row.client_updated_at,
        saved_at=row.updated_at,
    )


def _upsert(session: Session, payload: JournalEntryPayload) -> JournalEntry:
    row = session.scalar(
        select(JournalEntry).where(JournalEntry.entry_date == payload.date)
    )
    if row is None:
        row = JournalEntry(entry_date=payload.date, client_updated_at=payload.updated_at)
        _apply_payload(row, payload)
        session.add(row)
        session.flush()
        return row

    if _as_utc(payload.updated_at) >= _as_utc(row.client_updated_at):
        _apply_payload(row, payload)
        session.flush()
    return row


def list_journal_entries(session: Session) -> JournalEntryCollection:
    rows = session.scalars(
        select(JournalEntry).order_by(JournalEntry.entry_date.asc())
    ).all()
    return JournalEntryCollection(entries=[_to_view(row) for row in rows])


def sync_journal_entries(
    session: Session,
    payloads: list[JournalEntryPayload],
) -> JournalEntryCollection:
    for payload in payloads:
        _upsert(session, payload)
    session.commit()
    return list_journal_entries(session)


def upsert_journal_entry(
    session: Session,
    entry_date: str,
    payload: JournalEntryPayload,
) -> JournalEntryView:
    if str(payload.date) != entry_date:
        raise StonksUpError(
            "journal_date_mismatch",
            "Journal entry date does not match the request path.",
            details={"path_date": entry_date, "payload_date": str(payload.date)},
        )
    row = _upsert(session, payload)
    session.commit()
    session.refresh(row)
    return _to_view(row)
