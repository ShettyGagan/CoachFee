"""Fee-related DB operations: create student, ledger, record/allocate payments, receipts.

Services never call ``commit()``; the ``get_db`` generator handles that.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import rules
from app.config import GST_RATE_BP
from app.exceptions import Conflict, Invalid, NotFound
from app.models import (
    Batch, Centre, Guardian, Instalment, Payment, PaymentAllocation,
    PaymentLink, Receipt, Reminder, RiskFlag, Student,
)
from app.services.reminders import cancel_pending_reminders_for_paid_instalments


# ------------------------------------------------------------------ helpers
def _india_today() -> date:
    """Current date in Asia/Kolkata."""
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _next_student_code(db: Session) -> str:
    """Generate the next ``STU-XXXX`` code."""
    row = db.execute(
        text("SELECT student_code FROM students ORDER BY id DESC LIMIT 1")
    ).first()
    if row and row[0]:
        num = int(row[0].split("-")[1]) + 1
    else:
        num = 1
    return f"STU-{num:04d}"


def _next_receipt_no(db: Session) -> str:
    today = _india_today()
    year = today.year
    row = db.execute(
        text("SELECT COUNT(*) FROM receipts WHERE receipt_no LIKE :prefix"),
        {"prefix": f"RCPT-{year}-%"},
    ).scalar()
    seq = (row or 0) + 1
    return rules.generate_receipt_no(year, seq)


# ------------------------------------------------------------------ create student
def create_student(
    db: Session,
    *,
    full_name: str,
    batch_id: int,
    guardian_name: str,
    guardian_phone: str,
    language: str,
    discount_paise: int,
    discount_reason: str | None,
    staff_centre_id: int | None,
) -> dict:
    """Create a student, link/create guardian, generate instalments. Returns ledger."""
    # 1. batch lookup + centre check
    batch = db.get(Batch, batch_id)
    if batch is None:
        raise NotFound("NOT_FOUND", "Batch not found.")
    if staff_centre_id is not None and batch.centre_id != staff_centre_id:
        raise NotFound("NOT_FOUND", "Batch not found.")

    gross = batch.total_fee_paise
    if discount_paise >= gross:
        raise Invalid("DISCOUNT_TOO_LARGE", "Discount cannot exceed the gross fee.")
    if discount_paise > 0 and not discount_reason:
        raise Invalid("VALIDATION_ERROR", "Discount reason is required.")
    net = gross - discount_paise

    # 2. guardian (find or create by phone)
    guardian = db.execute(
        select(Guardian).where(Guardian.phone == guardian_phone)
    ).scalar_one_or_none()
    if guardian is None:
        guardian = Guardian(
            name=guardian_name,
            phone=guardian_phone,
            language=language,
        )
        db.add(guardian)
        db.flush()

    # 3. student
    student = Student(
        student_code=_next_student_code(db),
        full_name=full_name,
        batch_id=batch_id,
        guardian_id=guardian.id,
        status="active",
        enrolled_on=_india_today(),
        gross_fee_paise=gross,
        discount_paise=discount_paise,
        discount_reason=discount_reason,
        net_fee_paise=net,
        registration_fee_paise=batch.registration_fee_paise,
    )
    db.add(student)
    db.flush()

    # 4. instalments
    inst_data = rules.build_instalments(
        net_fee_paise=net,
        count=batch.instalment_count,
        first_due_date=batch.first_due_date,
        gap_months=batch.gap_months,
    )
    for d in inst_data:
        db.add(Instalment(
            student_id=student.id,
            seq=d["seq"],
            due_date=d["due_date"],
            amount_paise=d["amount_paise"],
        ))
    db.flush()

    return get_ledger(db, student.id, staff_centre_id=staff_centre_id, mask_phone=False)


# ------------------------------------------------------------------ ledger
def get_ledger(
    db: Session,
    student_id: int,
    *,
    staff_centre_id: int | None = None,
    mask_phone: bool = False,
    guardian_id: int | None = None,
) -> dict:
    """Build the full ledger for a student. Raises NotFound on scope mismatch."""
    student = db.get(Student, student_id)
    if student is None:
        raise NotFound()
    batch = db.get(Batch, student.batch_id)
    if batch is None:
        raise NotFound()
    # scope check
    if staff_centre_id is not None and batch.centre_id != staff_centre_id:
        raise NotFound()
    if guardian_id is not None and student.guardian_id != guardian_id:
        raise NotFound()

    guardian = db.get(Guardian, student.guardian_id)
    centre = db.get(Centre, batch.centre_id)

    # instalments from view
    rows = db.execute(
        text("""
            SELECT instalment_id, seq, due_date, amount_paise,
                   paid_paise, balance_paise, days_overdue
            FROM instalment_status
            WHERE student_id = :sid
            ORDER BY seq
        """),
        {"sid": student_id},
    ).all()

    today = _india_today()
    instalments = []
    for r in rows:
        instalments.append({
            "id": r.instalment_id,
            "instalment_id": r.instalment_id,
            "seq": r.seq,
            "due_date": r.due_date.isoformat() if hasattr(r.due_date, 'isoformat') else str(r.due_date),
            "amount_paise": r.amount_paise,
            "paid_paise": r.paid_paise,
            "balance_paise": r.balance_paise,
            "days_overdue": r.days_overdue,
            "status": rules.instalment_status(r.due_date, r.amount_paise, r.paid_paise, today),
        })

    total_paid = sum(i["paid_paise"] for i in instalments)
    total_balance = sum(i["balance_paise"] for i in instalments)

    # payments
    payments_rows = db.execute(
        select(Payment).where(Payment.student_id == student_id).order_by(Payment.received_at.desc())
    ).scalars().all()
    payments = []
    for p in payments_rows:
        receipt_row = db.execute(
            select(Receipt.id, Receipt.receipt_no).where(Receipt.payment_id == p.id)
        ).first()
        payments.append({
            "id": p.id,
            "payment_id": p.id,
            "amount_paise": p.amount_paise,
            "method": p.method,
            "reference": p.reference,
            "received_at": p.received_at.isoformat() if p.received_at else None,
            "created_at": p.received_at.isoformat() if p.received_at else None,
            "receipt_id": receipt_row[0] if receipt_row else None,
            "receipt_no": receipt_row[1] if receipt_row else None,
        })

    # open risk flag
    flag = db.execute(
        select(RiskFlag).where(RiskFlag.student_id == student_id, RiskFlag.status == "open")
    ).scalar_one_or_none()
    open_risk_flag = None
    if flag:
        open_risk_flag = {
            "id": flag.id,
            "flag_id": flag.id,
            "score": flag.score,
            "level": flag.level,
            "reasons": flag.reasons,
            "status": flag.status,
        }

    phone = guardian.phone if guardian else ""
    if mask_phone:
        from app.rules import mask_phone as _mp
        phone = _mp(phone)

    return {
        "student": {
            "id": student.id,
            "student_code": student.student_code,
            "full_name": student.full_name,
            "status": student.status,
            "batch": batch.name if batch else "",
            "gross_fee_paise": student.gross_fee_paise,
            "discount_paise": student.discount_paise,
            "net_fee_paise": student.net_fee_paise,
            "guardian": {
                "name": guardian.name if guardian else "",
                "phone": phone,
                "language": guardian.language if guardian else "hi",
            },
        },
        "totals": {"paid_paise": total_paid, "balance_paise": total_balance},
        "instalments": instalments,
        "payments": payments,
        "open_risk_flag": open_risk_flag,

        # flattened fields for frontend compatibility
        "student_id": student.id,
        "name": student.full_name,
        "student_code": student.student_code,
        "status": student.status,
        "batch_name": batch.name if batch else "",
        "batch_id": student.batch_id,
        "centre_name": centre.name if centre else "",
        "guardian_name": guardian.name if guardian else "",
        "guardian_phone": phone,
        "total_fee_paise": student.gross_fee_paise,
        "registration_fee_paise": student.registration_fee_paise,
        "discount_paise": student.discount_paise,
        "total_paid_paise": total_paid,
        "total_balance_paise": total_balance,
    }


# ------------------------------------------------------------------ record payment
def record_payment(
    db: Session,
    *,
    student_id: int | None,
    amount_paise: int,
    method: str,
    reference: str | None,
    recorded_by: int,
    staff_centre_id: int | None,
) -> dict:
    """Record a cash/cheque/bank_transfer payment. FIFO-allocate if student given."""
    if method == "online":
        raise Invalid("VALIDATION_ERROR", "Online payments can only be created by the gateway.")

    # generate ref for cash
    if method == "cash":
        reference = f"CASH-{uuid.uuid4().hex[:12]}"
    if not reference:
        raise Invalid("VALIDATION_ERROR", "Reference is required for this payment method.")

    # scope check on student
    if student_id is not None:
        student = db.get(Student, student_id)
        if student is None:
            raise NotFound()
        batch = db.get(Batch, student.batch_id)
        if staff_centre_id is not None and batch and batch.centre_id != staff_centre_id:
            raise NotFound()

    # duplicate check
    existing = db.execute(
        select(Payment).where(Payment.method == method, Payment.reference == reference)
    ).scalar_one_or_none()
    if existing:
        raise Conflict("DUPLICATE_PAYMENT", "A payment with this method and reference already exists.")

    payment = Payment(
        student_id=student_id,
        amount_paise=amount_paise,
        method=method,
        reference=reference,
        status="succeeded",
        recorded_by=recorded_by,
    )
    db.add(payment)
    db.flush()

    allocations = []
    receipt_id = None
    unallocated = amount_paise

    if student_id is not None:
        allocations, unallocated, receipt_id = _allocate_and_receipt(
            db, payment, student_id
        )

    receipt_no = None
    if receipt_id:
        r_obj = db.get(Receipt, receipt_id)
        if r_obj:
            receipt_no = r_obj.receipt_no

    allocated_paise = sum(a["amount_paise"] for a in allocations)
    receipts_list = [{"receipt_no": receipt_no, "total_paise": allocated_paise}] if receipt_no else []

    return {
        "payment": {
            "id": payment.id,
            "student_id": payment.student_id,
            "amount_paise": payment.amount_paise,
            "method": payment.method,
            "reference": payment.reference,
            "status": payment.status,
            "received_at": payment.received_at.isoformat() if payment.received_at else None,
        },
        "allocations": [{"instalment_id": a["instalment_id"], "amount_paise": a["amount_paise"]} for a in allocations],
        "receipt_id": receipt_id,
        "unallocated_paise": unallocated,
        "payment_id": payment.id,
        "allocated_paise": allocated_paise,
        "receipts": receipts_list,
    }


# ------------------------------------------------------------------ allocate unmatched
def allocate_payment(
    db: Session,
    payment_id: int,
    student_id: int,
    staff_centre_id: int | None,
) -> dict:
    """Allocate an existing payment to a student. FIFO over open instalments."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFound()

    student = db.get(Student, student_id)
    if student is None:
        raise NotFound()
    batch = db.get(Batch, student.batch_id)
    if staff_centre_id is not None and batch and batch.centre_id != staff_centre_id:
        raise NotFound()

    # compute unallocated
    allocated_sum = db.execute(
        select(func.coalesce(func.sum(PaymentAllocation.amount_paise), 0))
        .where(PaymentAllocation.payment_id == payment_id)
    ).scalar() or 0
    unallocated = payment.amount_paise - allocated_sum
    if unallocated <= 0:
        raise Conflict("NOTHING_TO_ALLOCATE", "This payment is fully allocated.")

    # set student if blank
    if payment.student_id is None:
        payment.student_id = student_id
        db.flush()

    # open instalments
    rows = db.execute(text("""
        SELECT instalment_id, balance_paise
        FROM instalment_status
        WHERE student_id = :sid AND balance_paise > 0
        ORDER BY due_date
    """), {"sid": student_id}).all()

    if not rows:
        raise Conflict("NOTHING_TO_ALLOCATE", "No open instalments for this student.")

    open_insts = [{"instalment_id": r.instalment_id, "balance_paise": r.balance_paise} for r in rows]
    allocs, remaining = rules.allocate_fifo(unallocated, open_insts)

    for a in allocs:
        db.add(PaymentAllocation(
            payment_id=payment_id,
            instalment_id=a["instalment_id"],
            amount_paise=a["amount_paise"],
        ))
    db.flush()

    # cancel reminders for fully-paid instalments (shared function)
    cancel_pending_reminders_for_paid_instalments(db, student_id=student_id)

    # receipt
    receipt_id = None
    existing_receipt = db.execute(
        select(Receipt.id).where(Receipt.payment_id == payment_id)
    ).scalar_one_or_none()
    if existing_receipt is None and student_id:
        receipt_id = _issue_receipt(db, payment, student_id)
    else:
        receipt_id = existing_receipt

    receipt_no = None
    if receipt_id:
        r_obj = db.get(Receipt, receipt_id)
        if r_obj:
            receipt_no = r_obj.receipt_no

    allocated_paise = sum(a["amount_paise"] for a in allocs)
    receipts_list = [{"receipt_no": receipt_no, "total_paise": allocated_paise}] if receipt_no else []

    return {
        "payment": {
            "id": payment.id,
            "student_id": payment.student_id,
            "amount_paise": payment.amount_paise,
            "method": payment.method,
            "reference": payment.reference,
            "status": payment.status,
            "received_at": payment.received_at.isoformat() if payment.received_at else None,
        },
        "allocations": [{"instalment_id": a["instalment_id"], "amount_paise": a["amount_paise"]} for a in allocs],
        "receipt_id": receipt_id,
        "unallocated_paise": remaining,
        "payment_id": payment.id,
        "allocated_paise": allocated_paise,
        "receipts": receipts_list,
    }


# ------------------------------------------------------------------ internal helpers
def _allocate_and_receipt(
    db: Session,
    payment: Payment,
    student_id: int,
) -> tuple[list[dict], int, int | None]:
    """FIFO allocate a payment, issue receipt, cancel reminders. Returns (allocations, unallocated, receipt_id)."""
    rows = db.execute(text("""
        SELECT instalment_id, balance_paise
        FROM instalment_status
        WHERE student_id = :sid AND balance_paise > 0
        ORDER BY due_date
    """), {"sid": student_id}).all()

    open_insts = [{"instalment_id": r.instalment_id, "balance_paise": r.balance_paise} for r in rows]
    allocs, unallocated = rules.allocate_fifo(payment.amount_paise, open_insts)

    for a in allocs:
        db.add(PaymentAllocation(
            payment_id=payment.id,
            instalment_id=a["instalment_id"],
            amount_paise=a["amount_paise"],
        ))
    db.flush()

    # cancel paid reminders (shared function)
    cancel_pending_reminders_for_paid_instalments(db, student_id=student_id)

    # receipt
    receipt_id = _issue_receipt(db, payment, student_id)

    return allocs, unallocated, receipt_id


def _issue_receipt(db: Session, payment: Payment, student_id: int) -> int:
    """Create a GST receipt for *payment*. Returns the receipt id."""
    gst = rules.compute_gst(payment.amount_paise, GST_RATE_BP)
    receipt_no = _next_receipt_no(db)
    receipt = Receipt(
        receipt_no=receipt_no,
        payment_id=payment.id,
        student_id=student_id,
        total_paise=payment.amount_paise,
        taxable_paise=gst["taxable_paise"],
        cgst_paise=gst["cgst_paise"],
        sgst_paise=gst["sgst_paise"],
        gst_rate_bp=GST_RATE_BP,
    )
    db.add(receipt)
    db.flush()
    return receipt.id


def _cancel_paid_reminders(db: Session, student_id: int) -> None:
    """Backwards-compatible alias delegating to shared cancel function."""
    cancel_pending_reminders_for_paid_instalments(db, student_id=student_id)


# ------------------------------------------------------------------ receipt lookup
def get_receipt(db: Session, receipt_id: int) -> dict:
    """Return a single receipt with student and payment info."""
    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        raise NotFound()
    student = db.get(Student, receipt.student_id)
    payment = db.get(Payment, receipt.payment_id)
    return {
        "receipt_no": receipt.receipt_no,
        "issued_at": receipt.issued_at.isoformat() if receipt.issued_at else None,
        "student": {
            "student_code": student.student_code if student else "",
            "full_name": student.full_name if student else "",
        },
        "total_paise": receipt.total_paise,
        "taxable_paise": receipt.taxable_paise,
        "cgst_paise": receipt.cgst_paise,
        "sgst_paise": receipt.sgst_paise,
        "gst_rate_bp": receipt.gst_rate_bp,
        "payment": {
            "method": payment.method if payment else "",
            "reference": payment.reference if payment else "",
        },
    }

