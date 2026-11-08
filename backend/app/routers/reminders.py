"""Reminder routes: list and run job."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.schemas import ReminderJobResult
from app.security import require_staff
from app.services import reminders as rem_svc

router = APIRouter(tags=["reminders"])


@router.get("/reminders")
def list_reminders(
    status: str | None = Query(None),
    student_id: int | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: dict = Depends(require_staff("accounts", "admin", "counsellor")),
    db: Session = Depends(get_db),
):
    """List reminders with status, message and reason notes, filterable by status, paginated, newest first.

    Centre-scoped according to the authenticated staff member's centre.
    """
    centre_id = principal.get("centre_id")
    items, total = rem_svc.list_reminders(
        db,
        centre_id=centre_id,
        status=status,
        student_id=student_id,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total}


@router.post("/reminders/run", response_model=ReminderJobResult)
@router.post("/admin/jobs/reminders/run", response_model=ReminderJobResult)
def run_reminder_job(
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Run the reminder job on demand (accounts and admin only).

    Schedules missing reminders and sends those due today or earlier.
    Returns counts of created, sent, and skipped reminders.
    Centre-scoped according to the authenticated staff member's centre.
    """
    centre_id = principal.get("centre_id")
    result = rem_svc.run_reminder_job(db, centre_id=centre_id)

    # Invalidate cached reminders and dashboard data
    cache.delete_pattern("reminders:*")
    cache.delete_pattern("dashboard:*")

    return ReminderJobResult(**result)
