"""Payment gateway service.

When ``CASHFREE_APP_ID`` / ``CASHFREE_SECRET_KEY`` are set the service uses
the real Cashfree Payment Links API.  Otherwise it falls back to the built-in
mock gateway (useful for local dev without credentials).

The two external-facing functions are:
  - ``create_pay_link()`` → returns {token, pay_url, amount_paise, expires_at}
  - ``complete_online_payment()`` → used only by the mock gateway route
  - ``handle_cashfree_webhook()`` → used by the Cashfree webhook route
"""
from __future__ import annotations

import secrets
import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import rules
from app.config import GST_RATE_BP, PAY_LINK_TTL_HOURS
from app.exceptions import Conflict, NotFound
from app.models import (
    Instalment, Guardian, Payment, PaymentAllocation, PaymentLink,
    Receipt, Student,
)
from app.services import cashfree as cf
from app.services.fees import _allocate_and_receipt, _india_today
from app.services.reminders import cancel_pending_reminders_for_paid_instalments

log = logging.getLogger(__name__)


# ──────────────────────────── helpers ──────────────────────────────────── #

def _get_instalment_or_404(db: Session, instalment_id: int) -> Instalment:
    inst = db.get(Instalment, instalment_id)
    if inst is None:
        raise NotFound()
    return inst


def _get_student_or_404(db: Session, student_id: int, guardian_id: int) -> Student:
    student = db.get(Student, student_id)
    if student is None or student.guardian_id != guardian_id:
        raise NotFound()
    return student


def _balance_paise(db: Session, instalment_id: int) -> int:
    row = db.execute(
        text("SELECT balance_paise FROM instalment_status WHERE instalment_id = :iid"),
        {"iid": instalment_id},
    ).first()
    if row is None or row.balance_paise <= 0:
        raise Conflict("NOTHING_DUE", "This instalment is fully paid.")
    return int(row.balance_paise)


# ──────────────────────── create_pay_link ──────────────────────────────── #

def create_pay_link(db: Session, instalment_id: int, guardian_id: int) -> dict:
    """Create (or reuse) a pay link for one instalment.

    Returns:
        {token, pay_url, amount_paise, expires_at}

    * If Cashfree is configured → creates a real Cashfree Payment Link.
      ``pay_url`` is the Cashfree hosted checkout URL.
    * Otherwise → creates an internal mock token.
      ``pay_url`` is ``/pay/{token}`` (served by MockGateway.tsx).
    """
    instalment = _get_instalment_or_404(db, instalment_id)
    student = _get_student_or_404(db, instalment.student_id, guardian_id)

    if student.status != "active":
        raise Conflict("STUDENT_NOT_ACTIVE", "Student is not active.")

    balance = _balance_paise(db, instalment_id)
    now = datetime.now(timezone.utc)

    # Try to reuse an open, unexpired link with same amount
    existing = db.execute(
        select(PaymentLink).where(
            PaymentLink.instalment_id == instalment_id,
            PaymentLink.status == "open",
            PaymentLink.expires_at > now,
        )
    ).scalar_one_or_none()

    if existing and existing.amount_paise == balance:
        pay_url = _resolve_pay_url(existing.token)
        return {
            "token": existing.token,
            "pay_url": pay_url,
            "amount_paise": existing.amount_paise,
            "expires_at": existing.expires_at.isoformat(),
        }

    # Expire old link if amount changed
    if existing:
        existing.status = "expired"
        db.flush()

    expires_at = now + timedelta(hours=PAY_LINK_TTL_HOURS)

    if cf.is_configured():
        return _create_cashfree_link(db, instalment, student, guardian_id, balance, expires_at)
    else:
        return _create_mock_link(db, instalment_id, balance, expires_at)


def _create_cashfree_link(
    db: Session,
    instalment: Instalment,
    student: Student,
    guardian_id: int,
    balance: int,
    expires_at: datetime,
) -> dict:
    """Create a real Cashfree Payment Link."""
    # Fetch guardian phone for customer_details
    guardian = db.get(Guardian, guardian_id)
    customer_phone = guardian.phone if guardian else "+919999999999"
    customer_name = guardian.name if guardian else student.full_name

    # Build a stable link_id using our internal token prefix
    # Format: INST-{instalment_id}-{6-char random} (max 50 chars, well within Cashfree limit)
    link_id = f"INST-{instalment.id}-{secrets.token_hex(3).upper()}"

    # Fetch batch name for the purpose field
    batch_name = ""
    try:
        from app.models import Batch
        b = db.get(Batch, instalment.batch_id if hasattr(instalment, 'batch_id') else None)
        if b:
            batch_name = b.name
    except Exception:
        pass

    purpose = f"Instalment #{instalment.seq} – {student.full_name}"
    if batch_name:
        purpose += f" ({batch_name})"

    try:
        resp = cf.create_payment_link(
            link_id=link_id,
            amount_paise=balance,
            purpose=purpose,
            customer_name=customer_name,
            customer_phone=customer_phone,
        )
    except httpx.HTTPStatusError as exc:
        log.error("Cashfree create link failed: %s %s", exc.response.status_code, exc.response.text)
        raise Conflict("GATEWAY_ERROR", f"Payment gateway error: {exc.response.text}")
    except httpx.RequestError as exc:
        log.error("Cashfree network error: %s", exc)
        raise Conflict("GATEWAY_ERROR", "Could not reach payment gateway. Try again.")

    pay_url = resp.get("link_url", "")
    # Store Cashfree link_id as our token so webhook can look it up
    link = PaymentLink(
        instalment_id=instalment.id,
        token=link_id,          # Cashfree link_id IS our token
        amount_paise=balance,
        status="open",
        expires_at=expires_at,
    )
    db.add(link)
    db.flush()

    return {
        "token": link_id,
        "pay_url": pay_url,
        "amount_paise": balance,
        "expires_at": expires_at.isoformat(),
    }


def _create_mock_link(
    db: Session,
    instalment_id: int,
    balance: int,
    expires_at: datetime,
) -> dict:
    """Create an internal mock pay link (no external gateway)."""
    token = secrets.token_urlsafe(32)
    link = PaymentLink(
        instalment_id=instalment_id,
        token=token,
        amount_paise=balance,
        status="open",
        expires_at=expires_at,
    )
    db.add(link)
    db.flush()
    return {
        "token": token,
        "pay_url": f"/pay/{token}",
        "amount_paise": balance,
        "expires_at": expires_at.isoformat(),
    }


def _resolve_pay_url(token: str) -> str:
    """Given a stored token, work out whether it's a Cashfree link or mock."""
    if cf.is_configured() and token.startswith("INST-"):
        # Fetch current Cashfree URL
        try:
            resp = cf.get_payment_link(token)
            return resp.get("link_url", f"/pay/{token}")
        except Exception:
            pass
    return f"/pay/{token}"


# ──────────────────────── get_link_info (mock page) ────────────────────── #

def get_link_info(db: Session, token: str) -> dict:
    """Public link info – used by MockGateway.tsx (non-Cashfree mode)."""
    link = db.execute(
        select(PaymentLink).where(PaymentLink.token == token)
    ).scalar_one_or_none()
    if link is None:
        raise NotFound()

    instalment = db.get(Instalment, link.instalment_id)
    student = db.get(Student, instalment.student_id) if instalment else None

    receipt_id = None
    if link.status == "paid":
        ref = f"MOCK-{token}"
        payment = db.execute(
            select(Payment).where(Payment.method == "online", Payment.reference == ref)
        ).scalar_one_or_none()
        if payment:
            receipt_id = db.execute(
                select(Receipt.id).where(Receipt.payment_id == payment.id)
            ).scalar_one_or_none()

    return {
        "token": token,
        "institute_name": "Jaipur Coaching Institute",
        "student_name": student.full_name if student else "",
        "instalment_seq": instalment.seq if instalment else 0,
        "amount_paise": link.amount_paise,
        "status": link.status,
        "expires_at": link.expires_at.isoformat(),
        "receipt_id": receipt_id,
    }


# ─────────────────── complete_online_payment (mock only) ───────────────── #

def complete_online_payment(db: Session, token: str, outcome: str) -> dict:
    """Process a mock gateway payment.  Not used when Cashfree is configured."""
    link = db.execute(
        select(PaymentLink).where(PaymentLink.token == token).with_for_update()
    ).scalar_one_or_none()
    if link is None:
        raise NotFound()

    now = datetime.now(timezone.utc)
    if link.status == "expired" or (link.status == "open" and link.expires_at <= now):
        link.status = "expired"
        db.flush()
        raise Conflict("LINK_EXPIRED", "This payment link has expired.")

    if outcome == "failure":
        return {"status": "failed", "receipt_id": None, "already_paid": False}

    # Idempotent success
    ref = f"MOCK-{token}"
    existing_payment = db.execute(
        select(Payment).where(Payment.method == "online", Payment.reference == ref)
    ).scalar_one_or_none()
    if existing_payment:
        receipt_id = db.execute(
            select(Receipt.id).where(Receipt.payment_id == existing_payment.id)
        ).scalar_one_or_none()
        return {"status": "paid", "receipt_id": receipt_id, "already_paid": True}

    instalment = db.get(Instalment, link.instalment_id)
    student_id = instalment.student_id if instalment else None

    payment = Payment(
        student_id=student_id,
        amount_paise=link.amount_paise,
        method="online",
        reference=ref,
        status="succeeded",
        recorded_by=None,
    )
    db.add(payment)
    db.flush()

    _allocs, _unallocated, receipt_id = _allocate_and_receipt(db, payment, student_id)
    cancel_pending_reminders_for_paid_instalments(db, student_id=student_id)

    link.status = "paid"
    db.flush()

    return {"status": "paid", "receipt_id": receipt_id, "already_paid": False}


# ──────────────────── mark_link_paid_from_cashfree ──────────────────────── #

def mark_link_paid_from_cashfree(
    db: Session,
    link_id: str,
    cf_payment_id: str,
    amount_paise: int = 0,
) -> int | None:
    """Idempotently record payment and allocate FIFO for a paid Cashfree link.
    Returns receipt_id (or None).
    """
    link = db.execute(
        select(PaymentLink).where(PaymentLink.token == link_id).with_for_update()
    ).scalar_one_or_none()

    if link is None:
        log.warning("mark_link_paid_from_cashfree: link not found for %s", link_id)
        return None

    ref = f"CF-{cf_payment_id}"

    # Check if already processed
    existing = db.execute(
        select(Payment).where(Payment.reference == ref)
    ).scalar_one_or_none()
    if existing:
        receipt_id = db.execute(
            select(Receipt.id).where(Receipt.payment_id == existing.id)
        ).scalar_one_or_none()
        if link.status != "paid":
            link.status = "paid"
            db.flush()
        return receipt_id

    if link.status == "paid":
        # Already marked paid
        receipt = db.execute(
            select(Receipt.id)
            .join(PaymentAllocation, PaymentAllocation.payment_id == Receipt.payment_id)
            .where(PaymentAllocation.instalment_id == link.instalment_id)
            .order_by(Receipt.id.desc())
        ).first()
        return receipt[0] if receipt else None

    # Amount to record
    actual_amount = amount_paise if amount_paise > 0 else link.amount_paise
    instalment = db.get(Instalment, link.instalment_id)
    student_id = instalment.student_id if instalment else None

    payment = Payment(
        student_id=student_id,
        amount_paise=actual_amount,
        method="online",
        reference=ref,
        status="succeeded",
        recorded_by=None,
    )
    db.add(payment)
    db.flush()

    _allocs, _unallocated, receipt_id = _allocate_and_receipt(db, payment, student_id)
    cancel_pending_reminders_for_paid_instalments(db, student_id=student_id)

    link.status = "paid"
    db.flush()

    log.info("Cashfree payment recorded: link=%s, ref=%s, receipt=%s, amount=%s", link_id, ref, receipt_id, actual_amount)
    return receipt_id


# ──────────────────── handle_cashfree_webhook ──────────────────────────── #

def handle_cashfree_webhook(db: Session, payload: dict) -> dict:
    """Process a verified Cashfree webhook event.

    Handles: PAYMENT_LINK_EVENT with link_status PAID or order.transaction_status SUCCESS.
    Returns {"processed": True/False, "receipt_id": int|None}.
    """
    event_type = payload.get("type", "")
    data = payload.get("data", {})

    # Extract link details (can be directly on data, or in data.link)
    link_id = (
        data.get("link_id")
        or data.get("link", {}).get("link_id")
        or ""
    )
    link_status = (
        data.get("link_status")
        or data.get("link", {}).get("link_status")
        or ""
    ).upper()

    # Extract order / payment details
    order_data = data.get("order", {}) or data.get("payment", {})
    transaction_status = (
        order_data.get("transaction_status")
        or order_data.get("payment_status")
        or ""
    ).upper()

    cf_payment_id = str(
        order_data.get("transaction_id")
        or order_data.get("cf_payment_id")
        or order_data.get("order_id")
        or data.get("cf_link_id")
        or secrets.token_hex(4)
    )

    amount_rupees = float(
        order_data.get("order_amount")
        or order_data.get("payment_amount")
        or data.get("link_amount_paid")
        or data.get("link_amount")
        or 0
    )
    amount_paise = round(amount_rupees * 100)

    # Check if payment succeeded
    is_success = (
        link_status in ("PAID", "PARTIALLY_PAID")
        or transaction_status in ("SUCCESS", "PAID")
    )

    if not is_success or not link_id:
        log.info("Cashfree webhook ignored: link_id=%s, link_status=%s, tx_status=%s", link_id, link_status, transaction_status)
        return {"processed": False, "receipt_id": None}

    receipt_id = mark_link_paid_from_cashfree(
        db,
        link_id=link_id,
        cf_payment_id=cf_payment_id,
        amount_paise=amount_paise,
    )
    return {"processed": True, "receipt_id": receipt_id}
