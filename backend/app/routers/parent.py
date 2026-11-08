"""Parent portal routes: consent, children, dues, receipts, pay-link.

All response shapes are aligned to what the frontend (parent/Home.tsx) expects.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import rules
from app.config import POLICY_VERSION
from app.db import get_db
from app.exceptions import Conflict, Forbidden, Invalid, NotFound
from app.models import Guardian, Receipt, Student, Batch, Payment
from app.schemas import ConsentRequest
from app.security import require_guardian
from app.services import fees as fee_svc
from app.services import gateway as gw_svc
from app.services.fees import _india_today

router = APIRouter(prefix="/parent", tags=["parent"])


def _check_consent(db: Session, guardian_id: int) -> None:
    """Raise 403 if guardian has not consented."""
    guardian = db.get(Guardian, guardian_id)
    if guardian is None or guardian.consented_at is None:
        raise Forbidden("CONSENT_REQUIRED", "Please accept the data processing policy first.")


def _check_owns_student(db: Session, student_id: int, guardian_id: int) -> Student:
    """Return the student if owned by this guardian, else 404."""
    student = db.get(Student, student_id)
    if student is None or student.guardian_id != guardian_id:
        raise NotFound()
    return student


# ───────────────────────── consent ──────────────────────────────── #

@router.post("/consent", status_code=204)
def give_consent(
    body: ConsentRequest,
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """Accept the data processing policy."""
    if body.policy_version != POLICY_VERSION:
        raise Invalid("VALIDATION_ERROR", f"Expected policy version {POLICY_VERSION}.")
    guardian = db.get(Guardian, principal["sub"])
    if guardian is None:
        raise NotFound()
    guardian.consent_version = body.policy_version
    guardian.consented_at = datetime.now(timezone.utc)
    db.flush()


# ───────────────────────── children ─────────────────────────────── #

@router.get("/children")
def list_children(
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """List the guardian's children with summary dues.

    Frontend expects:
        { children: [{student_id, student_name, student_code, total_balance_paise, next_due}] }
    """
    _check_consent(db, principal["sub"])

    students = db.execute(
        select(Student).where(Student.guardian_id == principal["sub"])
    ).scalars().all()

    today = _india_today()
    children = []
    for s in students:
        rows = db.execute(text("""
            SELECT instalment_id, seq, due_date, amount_paise,
                   paid_paise, balance_paise, days_overdue
            FROM instalment_status
            WHERE student_id = :sid
            ORDER BY due_date
        """), {"sid": s.id}).all()

        total_balance = sum(r.balance_paise for r in rows)

        # find next due (earliest with balance > 0)
        next_due = None
        for r in rows:
            if r.balance_paise > 0:
                status = rules.instalment_status(r.due_date, r.amount_paise, r.paid_paise, today)
                next_due = {
                    "instalment_id": r.instalment_id,
                    "seq": r.seq,
                    "due_date": r.due_date.isoformat() if hasattr(r.due_date, "isoformat") else str(r.due_date),
                    "amount_paise": r.amount_paise,
                    "paid_paise": r.paid_paise,
                    "balance_paise": r.balance_paise,
                    "days_overdue": r.days_overdue,
                    "status": status,
                }
                break

        children.append({
            "student_id": s.id,
            "student_name": s.full_name,       # frontend: student_name (not "name")
            "student_code": s.student_code,
            "total_balance_paise": total_balance,
            "next_due": next_due,
        })

    return {"children": children}             # frontend: { children: [...] }


# ───────────────────────── dues ─────────────────────────────── #

@router.get("/children/{student_id}/dues")
def get_dues(
    student_id: int,
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """Get detailed dues for a child.

    Frontend expects:
        { student_id, student_name, next_due, instalments: [{instalment_id, seq, ...}] }
    """
    _check_consent(db, principal["sub"])
    student = _check_owns_student(db, student_id, principal["sub"])
    today = _india_today()

    rows = db.execute(text("""
        SELECT instalment_id AS id, seq, due_date, amount_paise,
               paid_paise, balance_paise, days_overdue
        FROM instalment_status
        WHERE student_id = :sid
        ORDER BY seq
    """), {"sid": student_id}).all()

    instalments = []
    next_due = None
    for r in rows:
        status = rules.instalment_status(r.due_date, r.amount_paise, r.paid_paise, today)
        inst = {
            "instalment_id": r.id,     # frontend uses instalment_id
            "seq": r.seq,
            "due_date": r.due_date.isoformat() if hasattr(r.due_date, "isoformat") else str(r.due_date),
            "amount_paise": r.amount_paise,
            "paid_paise": r.paid_paise,
            "balance_paise": r.balance_paise,
            "days_overdue": r.days_overdue,
            "status": status,
        }
        instalments.append(inst)
        if r.balance_paise > 0 and next_due is None:
            next_due = {
                "instalment_id": r.id,
                "seq": r.seq,
                "due_date": r.due_date.isoformat() if hasattr(r.due_date, "isoformat") else str(r.due_date),
                "amount_paise": r.amount_paise,
                "paid_paise": r.paid_paise,
                "balance_paise": r.balance_paise,
                "days_overdue": r.days_overdue,
                "status": status,
            }

    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "next_due": next_due,
        "instalments": instalments,
    }


# ───────────────────────── receipts ─────────────────────────────── #

@router.get("/children/{student_id}/receipts")
def list_receipts(
    student_id: int,
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """List receipts for a child.

    Frontend expects:
        { receipts: [{receipt_id, receipt_no, created_at, total_paise}] }
    """
    _check_consent(db, principal["sub"])
    _check_owns_student(db, student_id, principal["sub"])

    rows = db.execute(
        select(Receipt)
        .where(Receipt.student_id == student_id)
        .order_by(Receipt.issued_at.desc())
    ).scalars().all()

    receipts = [
        {
            "receipt_id": r.id,
            "receipt_no": r.receipt_no,
            "created_at": r.issued_at.isoformat() if r.issued_at else None,  # frontend: created_at
            "total_paise": r.total_paise,
        }
        for r in rows
    ]
    return {"receipts": receipts}            # frontend: { receipts: [...] }


@router.get("/receipts/{receipt_id}")
def get_receipt(
    receipt_id: int,
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """Get a single receipt.

    Frontend expects:
        { receipt_id, receipt_no, created_at, student_name, student_code,
          payment_method, reference, taxable_paise, cgst_paise, sgst_paise, total_paise }
    """
    _check_consent(db, principal["sub"])

    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        raise NotFound()

    student = db.get(Student, receipt.student_id)
    if student is None or student.guardian_id != principal["sub"]:
        raise NotFound()

    payment = db.get(Payment, receipt.payment_id)

    return {
        "receipt_id": receipt.id,
        "receipt_no": receipt.receipt_no,
        "created_at": receipt.issued_at.isoformat() if receipt.issued_at else None,
        "student_name": student.full_name,
        "student_code": student.student_code,
        "payment_method": payment.method if payment else "",
        "reference": payment.reference if payment else None,
        "taxable_paise": receipt.taxable_paise,
        "cgst_paise": receipt.cgst_paise,
        "sgst_paise": receipt.sgst_paise,
        "total_paise": receipt.total_paise,
    }


# ───────────────────────── pay link ─────────────────────────────── #

@router.post("/instalments/{instalment_id}/pay-link", status_code=201)
def create_pay_link(
    instalment_id: int,
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """Create or reuse a pay link for an instalment.

    Frontend expects: { token, pay_url }
    """
    _check_consent(db, principal["sub"])
    result = gw_svc.create_pay_link(db, instalment_id, guardian_id=principal["sub"])
    return {
        "token": result["token"],
        "pay_url": result["pay_url"],        # Cashfree URL or /pay/{token}
        "amount_paise": result["amount_paise"],
        "expires_at": result["expires_at"],
    }


# ───────────────────────── academics (attendance & tests) ────────── #

@router.get("/children/{student_id}/academics")
def get_child_academics(
    student_id: int,
    principal: dict = Depends(require_guardian),
    db: Session = Depends(get_db),
):
    """Get child's attendance and test score records for parent portal."""
    _check_consent(db, principal["sub"])
    student = _check_owns_student(db, student_id, principal["sub"])
    from app.services import academics as acad_svc
    return acad_svc.get_student_academics(db, student.id)

