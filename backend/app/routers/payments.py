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
    TransactionItem,
    TransactionListResponse,
    UnmatchedListResponse,
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


@router.get("/payments/transactions", response_model=TransactionListResponse)
def list_transactions(
    method: str | None = Query(None, description="Filter by method ('online', 'cash', 'bank_transfer', 'cheque', or 'all')"),
    status: str | None = Query(None, description="Filter by status ('succeeded', 'pending', 'failed', or 'all')"),
    search: str | None = Query(None, description="Search by student name, code, reference, or receipt number"),
    centre_id: int | None = Query(None, description="Centre ID filter for admin"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: dict = Depends(require_staff("accounts", "admin", "counsellor")),
    db: Session = Depends(get_db),
):
    """List payment transactions with filters and student/receipt metadata."""
    where_clauses = ["1=1"]
    params: dict = {}

    # Centre scoping
    user_centre = principal.get("centre_id")
    if user_centre is not None:
        where_clauses.append("(b.centre_id = :user_centre OR (p.student_id IS NULL AND p.recorded_by IN (SELECT id FROM users WHERE centre_id = :user_centre)))")
        params["user_centre"] = user_centre
    elif centre_id is not None:
        where_clauses.append("b.centre_id = :centre_id")
        params["centre_id"] = centre_id

    # Method filter
    if method and method.lower() != "all":
        where_clauses.append("p.method = :method")
        params["method"] = method.lower()

    # Status filter
    if status and status.lower() != "all":
        where_clauses.append("p.status = :status")
        params["status"] = status.lower()

    # Search filter
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        where_clauses.append("""
            (
                LOWER(s.full_name) LIKE :search
                OR LOWER(s.student_code) LIKE :search
                OR LOWER(p.reference) LIKE :search
                OR LOWER(r.receipt_no) LIKE :search
            )
        """)
        params["search"] = term

    where_sql = " AND ".join(where_clauses)

    # Aggregates / stats query
    stats_row = db.execute(text(f"""
        SELECT 
            COUNT(DISTINCT p.id) AS total_count,
            COALESCE(SUM(p.amount_paise), 0) AS total_amount_paise,
            COUNT(DISTINCT CASE WHEN p.method = 'online' AND p.status = 'succeeded' THEN p.id END) AS online_count,
            COALESCE(SUM(CASE WHEN p.method = 'online' AND p.status = 'succeeded' THEN p.amount_paise ELSE 0 END), 0) AS online_amount_paise
        FROM payments p
        LEFT JOIN students s ON s.id = p.student_id
        LEFT JOIN batches b ON b.id = s.batch_id
        LEFT JOIN receipts r ON r.payment_id = p.id
        WHERE {where_sql}
    """), params).first()

    total_count = stats_row.total_count if stats_row else 0
    total_amount_paise = int(stats_row.total_amount_paise) if stats_row else 0
    online_count = stats_row.online_count if stats_row else 0
    online_amount_paise = int(stats_row.online_amount_paise) if stats_row else 0

    # Paginated rows query
    rows = db.execute(text(f"""
        SELECT 
            p.id AS payment_id,
            p.student_id,
            p.amount_paise,
            p.method,
            p.reference,
            p.status,
            p.received_at,
            s.student_code,
            s.full_name AS student_name,
            b.name AS batch_name,
            c.name AS centre_name,
            c.id AS centre_id,
            r.id AS receipt_id,
            r.receipt_no,
            u.name AS recorded_by_name,
            COALESCE(pa.allocated_paise, 0) AS allocated_paise,
            CASE 
                WHEN (p.amount_paise - COALESCE(pa.allocated_paise, 0)) > 0 
                THEN (p.amount_paise - COALESCE(pa.allocated_paise, 0)) 
                ELSE 0 
            END AS unallocated_paise
        FROM payments p
        LEFT JOIN students s ON s.id = p.student_id
        LEFT JOIN batches b ON b.id = s.batch_id
        LEFT JOIN centres c ON c.id = b.centre_id
        LEFT JOIN receipts r ON r.payment_id = p.id
        LEFT JOIN users u ON u.id = p.recorded_by
        LEFT JOIN (
            SELECT payment_id, SUM(amount_paise) AS allocated_paise
            FROM payment_allocations
            GROUP BY payment_id
        ) pa ON pa.payment_id = p.id
        WHERE {where_sql}
        ORDER BY p.received_at DESC, p.id DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).all()

    items = [
        TransactionItem(
            payment_id=r.payment_id,
            student_id=r.student_id,
            student_code=r.student_code,
            student_name=r.student_name,
            batch_name=r.batch_name,
            centre_name=r.centre_name,
            centre_id=r.centre_id,
            amount_paise=r.amount_paise,
            method=r.method,
            reference=r.reference,
            status=r.status,
            received_at=r.received_at,
            receipt_id=r.receipt_id,
            receipt_no=r.receipt_no,
            recorded_by_name=r.recorded_by_name or ("Online Portal" if r.method == "online" else None),
            allocated_paise=int(r.allocated_paise),
            unallocated_paise=int(r.unallocated_paise),
        )
        for r in rows
    ]

    return TransactionListResponse(
        items=items,
        total=total_count,
        total_amount_paise=total_amount_paise,
        online_count=online_count,
        online_amount_paise=online_amount_paise,
    )


@router.get("/payments/unmatched", response_model=UnmatchedListResponse)
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

    total_unallocated = db.execute(text(f"""
        SELECT COALESCE(SUM(unallocated_paise), 0) FROM unmatched_payments um WHERE 1=1 {centre_filter}
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
    return UnmatchedListResponse(
        items=items,
        total=total,
        total_unallocated_paise=int(total_unallocated),
    )


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
    """Get a single receipt with flattened aliases for frontend compatibility."""
    res = fee_svc.get_receipt(db, receipt_id)
    student = res.get("student") or {}
    payment = res.get("payment") or {}
    res["receipt_id"] = receipt_id
    res["created_at"] = res.get("issued_at")
    res["student_name"] = student.get("full_name", "")
    res["student_code"] = student.get("student_code", "")
    res["payment_method"] = payment.get("method", "")
    res["reference"] = payment.get("reference", None)
    return res

