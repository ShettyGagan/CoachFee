"""Refund service: preview, create, status transitions."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import rules
from app.config import REFUND_DEADLINE_DAYS
from app.exceptions import Conflict, NotFound
from app.models import Batch, Refund, Reminder, Student
from app.services.fees import _india_today
from app.services.reminders import cancel_all_pending_reminders_for_student


def preview_refund(db: Session, student_id: int, leave_date) -> dict:
    """Compute refund without saving. Returns full breakdown."""
    student = db.get(Student, student_id)
    if student is None:
        raise NotFound()
    if student.status != "active":
        raise Conflict("STUDENT_NOT_ACTIVE", "Student is not active.")

    batch = db.get(Batch, student.batch_id)
    if batch is None:
        raise NotFound()

    # total paid = sum of allocations
    total_paid = db.execute(text("""
        SELECT COALESCE(SUM(pa.amount_paise), 0)
        FROM payment_allocations pa
        JOIN instalments i ON i.id = pa.instalment_id
        WHERE i.student_id = :sid
    """), {"sid": student_id}).scalar() or 0

    result = rules.compute_refund(
        net_fee_paise=student.net_fee_paise,
        total_paid_paise=total_paid,
        registration_fee_paise=student.registration_fee_paise,
        course_start=batch.course_start,
        course_end=batch.course_end,
        leave_date=leave_date,
    )
    result["student_id"] = student_id
    result["student_name"] = student.full_name
    result["student_code"] = student.student_code
    return result


def create_refund(db: Session, student_id: int, leave_date, created_by: int) -> dict:
    """Create a draft refund. Raises Conflict if one already exists."""
    student = db.get(Student, student_id)
    if student is None:
        raise NotFound()
    if student.status != "active":
        raise Conflict("STUDENT_NOT_ACTIVE", "Student is not active.")

    # check for existing open refund
    existing = db.execute(
        select(Refund).where(
            Refund.student_id == student_id,
            Refund.status.in_(["draft", "approved"]),
        )
    ).scalar_one_or_none()
    if existing:
        raise Conflict("REFUND_ALREADY_EXISTS", "An open refund already exists for this student.")

    preview = preview_refund(db, student_id, leave_date)

    refund = Refund(
        student_id=student_id,
        leave_date=leave_date,
        due_by=preview["due_by"],
        total_paid_paise=preview["total_paid_paise"],
        registration_fee_paise=preview["registration_fee_paise"],
        consumed_fee_paise=preview["consumed_fee_paise"],
        refund_paise=preview["refund_paise"],
        calculation=preview,
        status="draft",
        created_by=created_by,
    )
    db.add(refund)
    db.flush()

    return _refund_to_dict(db, refund)


def update_refund_status(db: Session, refund_id: int, new_status: str) -> dict:
    """Transition refund: draft → approved → paid."""
    refund = db.get(Refund, refund_id)
    if refund is None:
        raise NotFound()

    valid_transitions = {"draft": "approved", "approved": "paid"}
    if valid_transitions.get(refund.status) != new_status:
        raise Conflict(
            "INVALID_STATUS_TRANSITION",
            f"Cannot transition from '{refund.status}' to '{new_status}'.",
        )

    refund.status = new_status

    if new_status == "approved":
        # student becomes 'left'
        student = db.get(Student, refund.student_id)
        if student:
            student.status = "left"
            student.left_on = refund.leave_date
        # cancel pending reminders (shared function)
        cancel_all_pending_reminders_for_student(db, refund.student_id, note="student left")

    if new_status == "paid":
        refund.calculation = {
            **refund.calculation,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }

    db.flush()
    return _refund_to_dict(db, refund)


def list_refunds(
    db: Session,
    *,
    status: str | None = None,
    limit: int = 25,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """List refunds with optional status filter."""
    base = """
        FROM refunds r
        JOIN students s ON s.id = r.student_id
    """
    conditions = []
    params: dict = {}
    if status:
        conditions.append("r.status = :status")
        params["status"] = status

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    total = db.execute(text(f"SELECT COUNT(*) {base}{where}"), params).scalar() or 0

    rows = db.execute(text(f"""
        SELECT r.id, s.student_code, s.full_name AS student_name,
               r.leave_date, r.due_by, r.refund_paise, r.status
        {base}{where}
        ORDER BY r.created_at DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).all()

    today = _india_today()
    items = [
        {
            "id": r.id,
            "refund_id": r.id,
            "student_code": r.student_code,
            "student_name": r.student_name,
            "leave_date": r.leave_date.isoformat() if hasattr(r.leave_date, 'isoformat') else str(r.leave_date),
            "due_by": r.due_by.isoformat() if hasattr(r.due_by, 'isoformat') else str(r.due_by),
            "refund_paise": r.refund_paise,
            "status": r.status,
            "overdue": r.due_by < today and r.status != "paid",
        }
        for r in rows
    ]
    return items, total


def _refund_to_dict(db: Session, refund: Refund) -> dict:
    student = db.get(Student, refund.student_id)
    today = _india_today()
    return {
        "id": refund.id,
        "refund_id": refund.id,
        "student_code": student.student_code if student else "",
        "student_name": student.full_name if student else "",
        "leave_date": refund.leave_date.isoformat(),
        "due_by": refund.due_by.isoformat(),
        "refund_paise": refund.refund_paise,
        "status": refund.status,
        "overdue": refund.due_by < today and refund.status != "paid",
    }

