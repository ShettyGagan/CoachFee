"""Risk flag service.

Guardrail: this module must NOT import fees, reminders or refunds services.
It never sends messages, changes fees, creates refunds or touches payments.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import rules
from app.config import FALSE_FLAG_COOLDOWN_DAYS
from app.exceptions import Conflict, NotFound
from app.models import Batch, Guardian, RiskFlag, Student


def _india_today() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def run_risk_job(db: Session) -> dict:
    """Score every active student and create/update risk flags using fast batch queries."""
    today = _india_today()
    flagged = 0
    updated = 0
    skipped_cooldown = 0

    students = db.execute(
        select(Student.id).where(Student.status == "active")
    ).scalars().all()

    if not students:
        return {
            "scored": 0,
            "flagged": 0,
            "updated": 0,
            "skipped_cooldown": 0,
        }

    student_ids = list(students)
    scored = len(student_ids)

    # 1. Cooldown batch lookup (1 query)
    cooldown_rows = db.execute(text("""
        SELECT student_id, MAX(reviewed_at) AS last_false
        FROM risk_flags
        WHERE student_id = ANY(:sids) AND status = 'false_flag'
        GROUP BY student_id
    """), {"sids": student_ids}).all()
    cooldown_by_sid = {r.student_id: r.last_false for r in cooldown_rows}

    # 2. Overdue instalments batch lookup (1 query)
    overdue_rows = db.execute(text("""
        SELECT student_id, COUNT(*) AS cnt, COALESCE(MAX(days_overdue), 0) AS max_days
        FROM instalment_status
        WHERE student_id = ANY(:sids) AND days_overdue > 0
        GROUP BY student_id
    """), {"sids": student_ids}).all()
    overdue_by_sid = {r.student_id: (r.cnt, r.max_days) for r in overdue_rows}

    # 3. Attendance batch lookup (recent 4w vs previous 4w in 1 query)
    att_rows = db.execute(text("""
        SELECT 
            student_id,
            AVG(CASE WHEN date >= :start_recent THEN (CASE WHEN present THEN 100.0 ELSE 0.0 END) END) AS att_recent,
            AVG(CASE WHEN date >= :start_prev AND date < :start_recent THEN (CASE WHEN present THEN 100.0 ELSE 0.0 END) END) AS att_prev
        FROM attendance_records
        WHERE student_id = ANY(:sids) AND date >= :start_prev
        GROUP BY student_id
    """), {
        "sids": student_ids,
        "start_recent": today - timedelta(weeks=4),
        "start_prev": today - timedelta(weeks=8),
    }).all()
    att_by_sid = {r.student_id: (r.att_recent, r.att_prev) for r in att_rows}

    # 4. Test scores batch lookup (last 5 tests per student in 1 query)
    test_rows = db.execute(text("""
        SELECT student_id, score, max_score
        FROM (
            SELECT 
                student_id, score, max_score,
                ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY test_date DESC) as rn
            FROM test_scores
            WHERE student_id = ANY(:sids)
        ) sub
        WHERE rn <= 5
        ORDER BY student_id, rn DESC
    """), {"sids": student_ids}).all()
    tests_by_sid: dict[int, list[float]] = defaultdict(list)
    for r in test_rows:
        if r.max_score and r.max_score > 0:
            tests_by_sid[r.student_id].append(r.score / r.max_score * 100)

    # 5. Existing open flags batch lookup (1 query)
    existing_flags = db.execute(
        select(RiskFlag).where(
            RiskFlag.student_id.in_(student_ids),
            RiskFlag.status == "open",
        )
    ).scalars().all()
    flags_by_sid = {f.student_id: f for f in existing_flags}

    now_utc = datetime.now(timezone.utc)

    # 6. Evaluate all students in-memory
    for sid in student_ids:
        # Check false-flag cooldown
        last_false = cooldown_by_sid.get(sid)
        if last_false:
            # ensure timezone-aware comparison
            if last_false.tzinfo is None:
                last_false = last_false.replace(tzinfo=timezone.utc)
            cooldown_end = last_false + timedelta(days=FALSE_FLAG_COOLDOWN_DAYS)
            if now_utc < cooldown_end:
                skipped_cooldown += 1
                continue

        overdue_count, max_days = overdue_by_sid.get(sid, (0, 0))
        att_recent, att_prev = att_by_sid.get(sid, (None, None))
        test_pcts = tests_by_sid.get(sid, [])

        result = rules.compute_risk_score(
            overdue_instalments=overdue_count,
            max_days_overdue=max_days,
            attendance_recent=float(att_recent) if att_recent is not None else None,
            attendance_previous=float(att_prev) if att_prev is not None else None,
            test_scores=test_pcts,
        )

        if result["level"] is None:
            continue

        existing_flag = flags_by_sid.get(sid)
        if existing_flag:
            existing_flag.score = result["score"]
            existing_flag.level = result["level"]
            existing_flag.reasons = result["reasons"]
            updated += 1
        else:
            db.add(RiskFlag(
                student_id=sid,
                score=result["score"],
                level=result["level"],
                reasons=result["reasons"],
                status="open",
            ))
            flagged += 1

    db.flush()
    return {
        "scored": scored,
        "flagged": flagged,
        "updated": updated,
        "skipped_cooldown": skipped_cooldown,
    }


def list_risk_flags(
    db: Session,
    *,
    status: str | None = None,
    level: str | None = None,
    limit: int = 25,
    offset: int = 0,
    mask_phones: bool = True,
) -> tuple[list[dict], int]:
    """List risk flags with student info."""
    base = """
        FROM risk_flags rf
        JOIN students s ON s.id = rf.student_id
        JOIN batches b ON b.id = s.batch_id
        JOIN guardians g ON g.id = s.guardian_id
    """
    conditions = []
    params: dict = {}
    if status:
        conditions.append("rf.status = :status")
        params["status"] = status
    if level:
        conditions.append("rf.level = :level")
        params["level"] = level

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    total = db.execute(text(f"SELECT COUNT(*) {base}{where}"), params).scalar() or 0

    rows = db.execute(text(f"""
        SELECT rf.id, s.id AS student_id, s.student_code, s.full_name,
               b.name AS batch_name, g.phone AS guardian_phone,
               rf.score, rf.level, rf.reasons, rf.status, rf.note,
               rf.created_at
        {base}{where}
        ORDER BY rf.score DESC, rf.created_at DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).all()

    items = []
    for r in rows:
        phone = r.guardian_phone
        if mask_phones:
            phone = rules.mask_phone(phone)
        items.append({
            "id": r.id,
            "student": {
                "id": r.student_id,
                "student_code": r.student_code,
                "full_name": r.full_name,
                "batch": r.batch_name,
            },
            "guardian_phone": phone,
            "score": r.score,
            "level": r.level,
            "reasons": r.reasons,
            "status": r.status,
            "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return items, total


def update_risk_flag(
    db: Session,
    flag_id: int,
    *,
    new_status: str,
    note: str | None,
    assigned_to: int,
) -> dict:
    """Update an open flag to called or false_flag."""
    flag = db.get(RiskFlag, flag_id)
    if flag is None:
        raise NotFound()

    if flag.status != "open":
        raise Conflict(
            "INVALID_STATUS_TRANSITION",
            "Only open flags can be updated.",
        )

    flag.status = new_status
    flag.note = note
    flag.assigned_to = assigned_to
    flag.reviewed_at = datetime.now(timezone.utc)
    db.flush()

    student = db.get(Student, flag.student_id)
    batch = db.get(Batch, student.batch_id) if student else None
    guardian = db.get(Guardian, student.guardian_id) if student else None

    return {
        "id": flag.id,
        "student": {
            "id": student.id if student else None,
            "student_code": student.student_code if student else "",
            "full_name": student.full_name if student else "",
            "batch": batch.name if batch else "",
        },
        "guardian_phone": rules.mask_phone(guardian.phone) if guardian else "",
        "score": flag.score,
        "level": flag.level,
        "reasons": flag.reasons,
        "status": flag.status,
        "note": flag.note,
        "created_at": flag.created_at.isoformat() if flag.created_at else None,
    }

