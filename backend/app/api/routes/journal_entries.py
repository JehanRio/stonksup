from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_app_settings, get_db_session, success_response
from app.core.config import Settings
from app.schemas.common import ApiResponse
from app.schemas.journal_entries import (
    JournalEntryCollection,
    JournalAnalysisResult,
    JournalEntryPayload,
    JournalEntryView,
    JournalSyncRequest,
)
from app.services.journal_analysis import analyze_journal_entry
from app.services.journal_entries import (
    lock_journal_plan,
    list_journal_entries,
    sync_journal_entries,
    unlock_journal_plan,
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


@router.post("/{entry_date}/plan/lock", response_model=ApiResponse[JournalEntryView])
def lock_plan(
    entry_date: str,
    payload: JournalEntryPayload,
    request: Request,
    session: Session = Depends(get_db_session),
) -> ApiResponse[JournalEntryView]:
    return success_response(request, lock_journal_plan(session, entry_date, payload))


@router.post("/{entry_date}/plan/unlock", response_model=ApiResponse[JournalEntryView])
def unlock_plan(
    entry_date: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> ApiResponse[JournalEntryView]:
    return success_response(request, unlock_journal_plan(session, entry_date))


@router.post("/{entry_date}/analyze", response_model=ApiResponse[JournalAnalysisResult])
def analyze_entry(
    entry_date: str,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_db_session),
) -> ApiResponse[JournalAnalysisResult]:
    return success_response(request, analyze_journal_entry(session, settings, entry_date))
