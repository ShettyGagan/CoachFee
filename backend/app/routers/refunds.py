"""Refund routes: preview, create, list, status update."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    PaginatedResponse,
    RefundPreviewRequest,
    RefundStatusUpdate,
)
from app.security import require_staff
from app.services import refunds as refund_svc

router = APIRouter(tags=["refunds"])


@router.post("/refunds/preview")
def preview_refund(
    body: RefundPreviewRequest,
    _: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Preview a refund calculation (nothing saved)."""
    return refund_svc.preview_refund(db, body.student_id, body.leave_date)


@router.post("/refunds", status_code=201)
def create_refund(
    body: RefundPreviewRequest,
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Create a draft refund."""
    return refund_svc.create_refund(
        db, body.student_id, body.leave_date, created_by=principal["sub"],
    )


@router.get("/refunds")
def list_refunds(
    status: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """List refunds with optional status filter."""
    items, total = refund_svc.list_refunds(db, status=status, limit=limit, offset=offset)
    return PaginatedResponse(items=items, total=total)


@router.patch("/refunds/{refund_id}/status")
def update_refund_status(
    refund_id: int,
    body: RefundStatusUpdate,
    _: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Transition refund status: draft → approved → paid."""
    return refund_svc.update_refund_status(db, refund_id, body.status)

