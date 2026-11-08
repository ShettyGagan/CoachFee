"""Payment routes: record, unmatched, allocate, receipt."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.schemas import (
    AllocateRequest,
    PaginatedResponse,
    PaymentCreate,
    UnmatchedPaymentOut,
)
from app.security import require_staff
from app.services import fees as fee_svc

router = APIRouter(tags=["payments"])


@router.post("/payments", status_code=201)
def record_payment(
    body: PaymentCreate,
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Record a cash / cheque / bank-transfer payment."""
    res = fee_svc.record_payment(
        db,
        student_id=body.student_id,
        amount_paise=body.amount_paise,
        method=body.method,
        reference=body.reference,
        recorded_by=principal["sub"],
        staff_centre_id=principal.get("centre_id"),
    )
    cache.delete_pattern("dashboard:*")
    return res


@router.get("/payments/online-alerts")
def get_online_payment_alerts(
    limit: int = Query(15, ge=1, le=50),
    principal: dict = Depends(require_staff("accounts", "admin", "counsellor")),
    db: Session = Depends(get_db),
):
    """Real-time online payment alerts for staff."""
    centre_filter = ""
    params: dict = {"limit": limit}
    user_centre = principal.get("centre_id")
    if user_centre is not None:
        centre_filter = "AND b.centre_id = :user_centre"
        params["user_centre"] = user_centre

    rows = db.execute(text(f"""
        SELECT 
            p.id AS payment_id,
            p.amount_paise,
            p.reference,
            p.received_at,
            s.id AS student_id,
            s.student_code,
            s.full_name AS student_name,
            b.name AS batch_name,
            r.id AS receipt_id,
            r.receipt_no
        FROM payments p
        JOIN students s ON s.id = p.student_id
        JOIN batches b ON b.id = s.batch_id
        LEFT JOIN receipts r ON r.payment_id = p.id
        WHERE p.method = 'online' AND p.status = 'succeeded'
          {centre_filter}
        ORDER BY p.received_at DESC, p.id DESC
        LIMIT :limit
    """), params).all()

    items = [
        {
            "payment_id": r.payment_id,
            "student_id": r.student_id,
            "student_code": r.student_code,
            "student_name": r.student_name,
            "batch_name": r.batch_name,
            "amount_paise": r.amount_paise,
            "reference": r.reference,
            "received_at": r.received_at.isoformat() if r.received_at else None,
            "receipt_id": r.receipt_id,
            "receipt_no": r.receipt_no,
        }
        for r in rows
    ]

    return {"items": items, "total": len(items)}


@router.get("/payments/unmatched")
def list_unmatched(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """List unmatched (not fully allocated) payments."""
    # scope by centre if needed
    centre_filter = ""
    params: dict = {}
    user_centre = principal.get("centre_id")
    if user_centre is not None:
        centre_filter = """
            AND (um.student_id IS NULL OR um.student_id IN (
                SELECT s.id FROM students s JOIN batches b ON b.id = s.batch_id
                WHERE b.centre_id = :user_centre
            ))
        """
        params["user_centre"] = user_centre

    total = db.execute(text(f"""
        SELECT COUNT(*) FROM unmatched_payments um WHERE 1=1 {centre_filter}
    """), params).scalar() or 0

    rows = db.execute(text(f"""
        SELECT um.payment_id, um.student_id, um.amount_paise,
               um.unallocated_paise, um.method, um.reference, um.received_at
        FROM unmatched_payments um
        WHERE 1=1 {centre_filter}
        ORDER BY um.received_at DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).all()

    items = [
        UnmatchedPaymentOut(
            payment_id=r.payment_id,
            student_id=r.student_id,
            amount_paise=r.amount_paise,
            unallocated_paise=r.unallocated_paise,
            method=r.method,
            reference=r.reference,
            received_at=r.received_at,
        )
        for r in rows
    ]
    return PaginatedResponse(items=items, total=total)


@router.post("/payments/{payment_id}/allocate")
def allocate_payment(
    payment_id: int,
    body: AllocateRequest,
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Allocate an unmatched payment to a student."""
    res = fee_svc.allocate_payment(
        db,
        payment_id=payment_id,
        student_id=body.student_id,
        staff_centre_id=principal.get("centre_id"),
    )
    cache.delete_pattern("dashboard:*")
    return res


@router.get("/receipts/{receipt_id}")
def get_receipt(
    receipt_id: int,
    _: dict = Depends(require_staff()),
    db: Session = Depends(get_db),
):
    """Get a single receipt."""
    return fee_svc.get_receipt(db, receipt_id)

