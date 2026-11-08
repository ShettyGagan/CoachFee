"""Student routes: create, list, ledger."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.models import Batch, Centre, Guardian, Student
from app.rules import mask_phone
from app.schemas import PaginatedResponse, StudentCreate, StudentListItem
from app.security import current_principal, require_staff
from app.services import fees as fee_svc

router = APIRouter(prefix="/students", tags=["students"])


@router.post("", status_code=201)
def create_student(
    body: StudentCreate,
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Create a student with guardian and instalments."""
    ledger = fee_svc.create_student(
        db,
        full_name=body.full_name,
        batch_id=body.batch_id,
        guardian_name=body.guardian_name,
        guardian_phone=body.guardian_phone,
        language=body.language,
        discount_paise=body.discount_paise,
        discount_reason=body.discount_reason,
        staff_centre_id=principal.get("centre_id"),
    )
    cache.delete_pattern("dashboard:*")
    return ledger


@router.get("")
def list_students(
    centre_id: int | None = Query(None),
    batch_id: int | None = Query(None),
    q: str | None = Query(None),
    status: str | None = Query(None),
    overdue_only: bool = Query(False),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: dict = Depends(require_staff("accounts", "counsellor", "admin")),
    db: Session = Depends(get_db),
):
    """List students with filters and pagination."""
    conditions = []
    params: dict = {}

    user_centre = principal.get("centre_id")
    if user_centre is not None:
        conditions.append("b.centre_id = :user_centre")
        params["user_centre"] = user_centre
    elif centre_id is not None:
        conditions.append("b.centre_id = :centre_id")
        params["centre_id"] = centre_id

    if batch_id is not None:
        conditions.append("s.batch_id = :batch_id")
        params["batch_id"] = batch_id
    if status is not None:
        conditions.append("s.status = :status")
        params["status"] = status
    if q is not None:
        conditions.append("(s.full_name ILIKE :q OR s.student_code ILIKE :q)")
        params["q"] = f"%{q}%"

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    having = ""
    if overdue_only:
        having = " HAVING COALESCE(MAX(ist.days_overdue), 0) > 0"

    # total count
    count_query = f"""
        SELECT COUNT(*) FROM (
            SELECT s.id
            FROM students s
            JOIN batches b ON b.id = s.batch_id
            LEFT JOIN instalment_status ist ON ist.student_id = s.id
            {where}
            GROUP BY s.id
            {having}
        ) sub
    """
    total = db.execute(text(count_query), params).scalar() or 0

    # items
    rows = db.execute(text(f"""
        SELECT s.id, s.student_code, s.full_name, b.name AS batch_name,
               c.name AS centre_name, g.phone AS guardian_phone, s.status,
               COALESCE(SUM(ist.balance_paise), 0)::bigint AS balance_paise,
               COALESCE(MAX(ist.days_overdue), 0) AS max_days_overdue
        FROM students s
        JOIN batches b ON b.id = s.batch_id
        JOIN centres c ON c.id = b.centre_id
        JOIN guardians g ON g.id = s.guardian_id
        LEFT JOIN instalment_status ist ON ist.student_id = s.id
        {where}
        GROUP BY s.id, s.student_code, s.full_name, b.name, c.name, g.phone, s.status
        {having}
        ORDER BY s.id DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).all()

    items = [
        StudentListItem(
            id=r.id,
            student_id=r.id,
            student_code=r.student_code,
            full_name=r.full_name,
            name=r.full_name,
            batch=r.batch_name,
            batch_name=r.batch_name,
            centre=r.centre_name,
            centre_name=r.centre_name,
            guardian_phone=mask_phone(r.guardian_phone),
            status=r.status,
            balance_paise=r.balance_paise,
            max_days_overdue=r.max_days_overdue,
            days_overdue=r.max_days_overdue,
        )
        for r in rows
    ]
    return PaginatedResponse(items=items, total=total)


@router.get("/{student_id}/ledger")
def get_ledger(
    student_id: int,
    principal: dict = Depends(require_staff()),
    db: Session = Depends(get_db),
):
    """Get the full fee ledger for a student."""
    should_mask = principal.get("role") == "counsellor"
    return fee_svc.get_ledger(
        db,
        student_id,
        staff_centre_id=principal.get("centre_id"),
        mask_phone=should_mask,
    )

