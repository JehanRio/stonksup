from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session, success_response
from app.schemas.common import ApiResponse
from app.schemas.journal_entries import (
    JournalEntryCollection,
    JournalEntryPayload,
    JournalEntryView,
    JournalSyncRequest,
)
from app.services.journal_entries import (
    list_journal_entries,
    sync_journal_entries,
    upsert_journal_entry,
)


router = APIRouter(prefix="/journal-entries", tags=["journal-entries"])


@router.get("", response_model=ApiResponse[JournalEntryCollection])
def read_journal_entries(
    request: Request,
    session: Session = Depends(get_db_session),
) -> ApiResponse[JournalEntryCollection]:
    return success_response(request, list_journal_entries(session))


@router.post("/sync", response_model=ApiResponse[JournalEntryCollection])
def sync_local_journal_entries(
    payload: JournalSyncRequest,
    request: Request,
    session: Session = Depends(get_db_session),
) -> ApiResponse[JournalEntryCollection]:
    return success_response(request, sync_journal_entries(session, payload.entries))


@router.put("/{entry_date}", response_model=ApiResponse[JournalEntryView])
def save_journal_entry(
    entry_date: str,
    payload: JournalEntryPayload,
    request: Request,
    session: Session = Depends(get_db_session),
) -> ApiResponse[JournalEntryView]:
    return success_response(
        request,
        upsert_journal_entry(session, entry_date, payload),
    )
