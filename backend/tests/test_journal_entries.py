from datetime import UTC, datetime
from uuid import uuid4


def entry_payload(entry_date: str, summary: str, updated_at: str) -> dict[str, object]:
    return {
        "date": entry_date,
        "status": "draft",
        "market_phase": "发酵期",
        "market_notes": "指数缩量上涨",
        "focus": "AI 算力",
        "targets": "MU",
        "trade_plan": "回踩后分批买入",
        "daily_summary": summary,
        "ai_review": "",
        "ai_updated_at": None,
        "updated_at": updated_at,
    }


def test_sync_migrates_local_entries_and_lists_them(client) -> None:
    payload = entry_payload("2026-08-25", "执行符合计划", "2026-08-25T12:00:00Z")

    response = client.post("/api/v1/journal-entries/sync", json={"entries": [payload]})

    assert response.status_code == 200
    entry = response.json()["data"]["entries"][0]
    assert entry["date"] == "2026-08-25"
    assert entry["daily_summary"] == "执行符合计划"
    assert entry["saved_at"]

    listed = client.get("/api/v1/journal-entries")
    assert listed.status_code == 200
    assert listed.json()["data"]["entries"] == [entry]


def test_newer_database_entry_wins_during_sync(client) -> None:
    newer = entry_payload("2026-08-25", "服务器新版本", "2026-08-25T13:00:00Z")
    older = entry_payload("2026-08-25", "浏览器旧版本", "2026-08-25T12:00:00Z")

    saved = client.put("/api/v1/journal-entries/2026-08-25", json=newer)
    synced = client.post("/api/v1/journal-entries/sync", json={"entries": [older]})

    assert saved.status_code == 200
    assert synced.status_code == 200
    assert synced.json()["data"]["entries"][0]["daily_summary"] == "服务器新版本"


def test_put_rejects_date_mismatch(client) -> None:
    payload = entry_payload("2026-08-24", "错误日期", datetime.now(UTC).isoformat())

    response = client.put("/api/v1/journal-entries/2026-08-25", json=payload)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "journal_date_mismatch"


def test_locked_plan_preserves_original_and_records_revisions(client) -> None:
    original = entry_payload("2026-08-26", "", "2026-08-26T08:00:00Z")
    original["trade_plan"] = "只在 120 以下分批买入"

    locked = client.post("/api/v1/journal-entries/2026-08-26/plan/lock", json=original)
    assert locked.status_code == 200
    locked_entry = locked.json()["data"]
    assert locked_entry["plan_is_locked"] is True
    assert locked_entry["plan_revision"] == 1
    assert locked_entry["plan_history"][0]["trade_plan"] == "只在 120 以下分批买入"

    changed = {**original, "trade_plan": "追高买入", "daily_summary": "盘后内容", "updated_at": "2026-08-26T18:00:00Z"}
    saved = client.put("/api/v1/journal-entries/2026-08-26", json=changed)
    assert saved.status_code == 200
    assert saved.json()["data"]["trade_plan"] == "只在 120 以下分批买入"
    assert saved.json()["data"]["daily_summary"] == "盘后内容"

    assert client.post("/api/v1/journal-entries/2026-08-26/plan/unlock").status_code == 200
    relocked = client.post("/api/v1/journal-entries/2026-08-26/plan/lock", json=changed)
    assert relocked.status_code == 200
    assert relocked.json()["data"]["plan_revision"] == 2
    assert relocked.json()["data"]["trade_plan"] == "追高买入"


def test_structured_trades_are_persisted(client) -> None:
    payload = entry_payload("2026-08-26", "记录 MRNA 交易", "2026-08-26T15:30:00Z")
    trade_id = str(uuid4())
    payload["trades"] = [{
        "id": trade_id,
        "symbol": "mrna",
        "side": "buy",
        "executed_at": "2026-08-26T14:35:00Z",
        "price": "121.45",
        "quantity": "20",
        "planned": True,
        "note": "回踩计划位",
    }]

    response = client.put("/api/v1/journal-entries/2026-08-26", json=payload)

    assert response.status_code == 200
    trade = response.json()["data"]["trades"][0]
    assert trade["id"] == trade_id
    assert trade["symbol"] == "MRNA"
    assert trade["price"] == "121.45000000"
