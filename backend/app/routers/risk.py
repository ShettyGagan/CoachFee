"""Risk flag routes: list, run job, update."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.schemas import RiskFlagUpdate
from app.security import require_staff
from app.services import risk as risk_svc

router = APIRouter(tags=["risk"])


@router.post("/admin/jobs/risk/run")
def run_risk_job(
    _: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Score every active student and create/update risk flags.

    Returns shape expected by frontend:
        { scored, flagged, updated, skipped }
    """
    result = risk_svc.run_risk_job(db)
    cache.delete_pattern("dashboard:*")
    return {
        "scored": result["scored"],
        "flagged": result["flagged"],
        "updated": result["updated"],
        "skipped": result["skipped_cooldown"],  # frontend uses "skipped"
    }


@router.get("/risk-flags")
def list_risk_flags(
    status: str | None = Query(None),
    level: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: dict = Depends(require_staff("counsellor", "accounts", "admin")),
    db: Session = Depends(get_db),
):
    """List risk flags with optional filters.

    Returns shape expected by frontend:
        { items: [{flag_id, student_id, student_name, student_code, batch_name,
                   guardian_phone, level, score, reasons, status, flagged_at}],
          total }
    """
    raw_items, total = risk_svc.list_risk_flags(
        db, status=status, level=level, limit=limit, offset=offset,
    )

    # Flatten nested student object to top-level fields expected by frontend
    items = [
        {
            "flag_id": r["id"],
            "student_id": r["student"]["id"],
            "student_name": r["student"]["full_name"],
            "student_code": r["student"]["student_code"],
            "batch_name": r["student"]["batch"],
            "guardian_phone": r["guardian_phone"],
            "level": r["level"],
            "score": r["score"],
            "reasons": r["reasons"],
            "status": r["status"],
            "flagged_at": r["created_at"],
        }
        for r in raw_items
    ]
    return {"items": items, "total": total}


@router.patch("/risk-flags/{flag_id}")
def update_risk_flag(
    flag_id: int,
    body: RiskFlagUpdate,
    principal: dict = Depends(require_staff("counsellor", "accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Update an open flag to called or false_flag."""
    result = risk_svc.update_risk_flag(
        db, flag_id,
        new_status=body.status,
        note=body.note,
        assigned_to=principal["sub"],
    )
    # Return flattened shape consistent with list endpoint
    return {
        "flag_id": result["id"],
        "student_id": result["student"]["id"],
        "student_name": result["student"]["full_name"],
        "student_code": result["student"]["student_code"],
        "batch_name": result["student"]["batch"],
        "guardian_phone": result["guardian_phone"],
        "level": result["level"],
        "score": result["score"],
        "reasons": result["reasons"],
        "status": result["status"],
        "flagged_at": result["created_at"],
    }
