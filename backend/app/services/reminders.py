"""Reminder scheduling, sending (mock) and cancellation."""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import rules
from app.models import Batch, Guardian, Instalment, Reminder, Student

log = logging.getLogger(__name__)


def _india_today() -> date:
    """Current date in Asia/Kolkata."""
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


# ---------------------------------------------------------------------------
# Simulated delivery
# ---------------------------------------------------------------------------

def send_reminder_message(
    *,
    recipient_phone: str,
    message_text: str,
    language: str,
    student_id: int,
    instalment_id: int,
) -> bool:
    """Send reminder SMS/message (currently simulated).

    A real SMS or WhatsApp provider (Gupshup, Twilio, Kaleyra) can replace
    this function later without changing business logic or reminder state handling.
    """
    log.info(
        "SIMULATED SMS: to=%s lang=%s student_id=%s inst_id=%s msg=%r",
        recipient_phone,
        language,
        student_id,
        instalment_id,
        message_text[:80] + "..." if len(message_text) > 80 else message_text,
    )
    return True


# ---------------------------------------------------------------------------
# Shared cancellation functions (Stop once paid / student leaves)
# ---------------------------------------------------------------------------

def cancel_pending_reminders_for_paid_instalments(
    db: Session,
    *,
    student_id: int | None = None,
    instalment_id: int | None = None,
) -> int:
    """Cancel pending reminders for fully-paid instalments.

    Part payments (balance_paise > 0) are NOT cancelled.
    Called on:
    - staff payment entry (fees.record_payment)
    - assigning an unmatched payment (fees.allocate_payment)
    - online gateway payments (gateway.complete_pay_link / mark_link_paid_from_cashfree)

    Returns the number of reminders cancelled.
    """
    conditions = ["ist.balance_paise <= 0"]
    params: dict = {}
    if student_id is not None:
        conditions.append("ist.student_id = :sid")
        params["sid"] = student_id
    if instalment_id is not None:
        conditions.append("ist.instalment_id = :iid")
        params["iid"] = instalment_id

    query = text(f"""
        SELECT ist.instalment_id
        FROM instalment_status ist
        WHERE {" AND ".join(conditions)}
    """)
    rows = db.execute(query, params).all()
    paid_ids = [r.instalment_id for r in rows]

    if not paid_ids:
        return 0

    result = db.execute(
        text("""
            UPDATE reminders
            SET status = 'cancelled', note = 'paid'
            WHERE instalment_id = ANY(:paid_ids) AND status = 'pending'
        """),
        {"paid_ids": paid_ids},
    )
    cancelled_count = result.rowcount or 0
    if cancelled_count > 0:
        log.info("Cancelled %d pending reminders for paid instalment(s): %s", cancelled_count, paid_ids)
    return cancelled_count


def cancel_all_pending_reminders_for_student(
    db: Session,
    student_id: int,
    note: str = "student left",
) -> int:
    """Cancel all pending reminders for a student when they leave or refund is approved."""
    result = db.execute(
        text("""
            UPDATE reminders
            SET status = 'cancelled', note = :note
            WHERE instalment_id IN (
                SELECT id FROM instalments WHERE student_id = :sid
            ) AND status = 'pending'
        """),
        {"sid": student_id, "note": note},
    )
    cancelled_count = result.rowcount or 0
    if cancelled_count > 0:
        log.info("Cancelled %d pending reminders for student %d (note: %s)", cancelled_count, student_id, note)
    return cancelled_count


# ---------------------------------------------------------------------------
# Reminder Job (Optimized batch queries, no N+1 roundtrips)
# ---------------------------------------------------------------------------

def run_reminder_job(
    db: Session,
    centre_id: int | None = None,
    today: date | None = None,
) -> dict[str, int]:
    """Schedule missing reminders, then send pending ones.

    Idempotent: Safe to re-run; second run creates and sends 0.
    Concurrency safe: Row locking prevents race conditions.
    Centre-scoped when centre_id is provided.
    """
    if today is None:
        today = _india_today()

    created = _schedule_reminders(db, centre_id, today)
    sent, skipped = _send_reminders(db, centre_id, today)
    return {"created": created, "sent": sent, "skipped": skipped}


def _schedule_reminders(db: Session, centre_id: int | None, today: date) -> int:
    """Insert missing reminder rows for unpaid instalments of active students in bulk."""
    centre_clause = "AND b.centre_id = :cid" if centre_id is not None else ""
    params: dict = {}
    if centre_id is not None:
        params["cid"] = centre_id

    # 1. Fetch all unpaid instalments for active students in the centre
    query = text(f"""
        SELECT ist.instalment_id, ist.due_date
        FROM instalment_status ist
        JOIN students s ON s.id = ist.student_id
        JOIN batches b ON b.id = s.batch_id
        WHERE ist.balance_paise > 0 AND s.status = 'active'
        {centre_clause}
    """)
    rows = db.execute(query, params).all()
    if not rows:
        return 0

    inst_ids = [r.instalment_id for r in rows]

    # 2. Fetch all existing (instalment_id, kind) pairs in ONE bulk query
    existing_rows = db.execute(
        select(Reminder.instalment_id, Reminder.kind)
        .where(Reminder.instalment_id.in_(inst_ids))
    ).all()
    existing_set = {(r[0], r[1]) for r in existing_rows}

    # 3. Build missing reminder rows in-memory
    to_create = []
    for r in rows:
        schedule = rules.reminder_schedule(r.due_date)
        for item in schedule:
            key = (r.instalment_id, item["kind"])
            if key not in existing_set:
                to_create.append(Reminder(
                    instalment_id=r.instalment_id,
                    kind=item["kind"],
                    scheduled_for=item["scheduled_for"],
                    status="pending",
                ))
                existing_set.add(key)

    if to_create:
        db.add_all(to_create)
        db.flush()

    return len(to_create)


def _send_reminders(db: Session, centre_id: int | None, today: date) -> tuple[int, int]:
    """Send pending reminders whose scheduled_for <= today in bulk.

    Enforces:
    - At most ONE message per instalment per run (latest wins, older superseded).
    - Send-time balance re-check.
    - Skip checks: already paid, student left, no consent.
    - Concurrency protection via FOR UPDATE SKIP LOCKED.
    """
    # Find IDs of pending reminders due on or before today
    rem_id_query = (
        select(Reminder.id)
        .join(Instalment, Instalment.id == Reminder.instalment_id)
        .join(Student, Student.id == Instalment.student_id)
        .join(Batch, Batch.id == Student.batch_id)
        .where(Reminder.status == "pending", Reminder.scheduled_for <= today)
    )
    if centre_id is not None:
        rem_id_query = rem_id_query.where(Batch.centre_id == centre_id)

    # Concurrency safe: Lock only reminders table rows to prevent multi-table lock deadlock
    stmt = (
        select(Reminder)
        .where(Reminder.id.in_(rem_id_query))
        .order_by(Reminder.scheduled_for.asc(), Reminder.id.asc())
        .with_for_update(skip_locked=True)
    )
    pending = db.execute(stmt).scalars().all()

    sent = 0
    skipped = 0

    if not pending:
        return sent, skipped

    # Group pending reminders by instalment
    by_instalment: dict[int, list[Reminder]] = defaultdict(list)
    for rem in pending:
        by_instalment[rem.instalment_id].append(rem)

    kind_order = rules._KIND_ORDER

    # Determine candidate reminder to send and older superseded reminders
    candidates: list[Reminder] = []
    for inst_id, reminders in by_instalment.items():
        reminders.sort(key=lambda r: kind_order.get(r.kind, 0))
        candidate = reminders[-1]
        older_superseded = reminders[:-1]

        for older in older_superseded:
            older.status = "skipped"
            older.note = "superseded"
            skipped += 1

        candidates.append(candidate)

    if not candidates:
        db.flush()
        return sent, skipped

    # Pre-fetch status, instalment, student, and guardian data for all candidate instalments in ONE single query!
    candidate_inst_ids = [c.instalment_id for c in candidates]
    meta_rows = db.execute(text("""
        SELECT 
            ist.instalment_id,
            ist.balance_paise,
            i.seq AS instalment_seq,
            i.due_date,
            s.id AS student_id,
            s.status AS student_status,
            s.full_name AS student_name,
            g.name AS guardian_name,
            g.phone AS guardian_phone,
            g.language AS guardian_language,
            g.consent_version,
            g.consented_at
        FROM instalment_status ist
        JOIN instalments i ON i.id = ist.instalment_id
        JOIN students s ON s.id = i.student_id
        LEFT JOIN guardians g ON g.id = s.guardian_id
        WHERE ist.instalment_id = ANY(:iids)
    """), {"iids": candidate_inst_ids}).all()

    meta_by_inst_id = {r.instalment_id: r for r in meta_rows}

    for candidate in candidates:
        meta = meta_by_inst_id.get(candidate.instalment_id)
        if meta is None:
            candidate.status = "skipped"
            candidate.note = "not found"
            skipped += 1
            continue

        current_balance = meta.balance_paise
        student_status = meta.student_status
        has_consent = bool(meta.consent_version) and meta.consented_at is not None

        skip, reason = rules.should_skip_reminder(
            balance_paise=current_balance,
            student_status=student_status,
            has_consent=has_consent,
            scheduled_for=candidate.scheduled_for,
            today=today,
        )

        if skip:
            candidate.status = "skipped"
            candidate.note = reason
            skipped += 1
        else:
            lang = meta.guardian_language if meta.guardian_language in ("en", "hi") else "en"
            msg_text = rules.build_reminder_message(
                kind=candidate.kind,
                student_name=meta.student_name,
                instalment_seq=meta.instalment_seq,
                amount_paise=current_balance,
                due_date=meta.due_date,
                language=lang,
                guardian_name=meta.guardian_name or "",
            )

            send_reminder_message(
                recipient_phone=meta.guardian_phone or "",
                message_text=msg_text,
                language=lang,
                student_id=meta.student_id,
                instalment_id=candidate.instalment_id,
            )

            candidate.status = "sent"
            candidate.language = lang
            candidate.message = msg_text
            candidate.sent_at = datetime.now(timezone.utc)
            candidate.note = None
            sent += 1

    db.flush()
    return sent, skipped


# ---------------------------------------------------------------------------
# List Reminders (Centre-scoped, Paginated, Filterable)
# ---------------------------------------------------------------------------

def list_reminders(
    db: Session,
    *,
    centre_id: int | None = None,
    status: str | None = None,
    student_id: int | None = None,
    limit: int = 25,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Return reminders with student info, newest first, applying optional filters."""
    base = """
        FROM reminders r
        JOIN instalments i ON i.id = r.instalment_id
        JOIN students s ON s.id = i.student_id
        JOIN batches b ON b.id = s.batch_id
    """
    conditions = []
    params: dict = {}

    if centre_id is not None:
        conditions.append("b.centre_id = :centre_id")
        params["centre_id"] = centre_id
    if status:
        conditions.append("r.status = :status")
        params["status"] = status
    if student_id:
        conditions.append("s.id = :student_id")
        params["student_id"] = student_id

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    # Total count
    total = db.execute(text(f"SELECT COUNT(*) {base}{where}"), params).scalar() or 0

    # Newest first
    rows = db.execute(text(f"""
        SELECT r.id, s.student_code, s.full_name AS student_name,
               r.kind, r.scheduled_for, r.status, r.language,
               r.message, r.sent_at, r.note
        {base}{where}
        ORDER BY r.scheduled_for DESC, r.id DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).all()

    items = [
        {
            "id": r.id,
            "reminder_id": r.id,
            "student_code": r.student_code,
            "student_name": r.student_name,
            "kind": r.kind,
            "scheduled_for": r.scheduled_for.isoformat() if hasattr(r.scheduled_for, "isoformat") else str(r.scheduled_for),
            "scheduled_at": r.scheduled_for.isoformat() if hasattr(r.scheduled_for, "isoformat") else str(r.scheduled_for),
            "status": r.status,
            "language": r.language or "en",
            "message": r.message or "",
            "message_text": r.message or "",
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            "note": r.note,
        }
        for r in rows
    ]
    return items, total
