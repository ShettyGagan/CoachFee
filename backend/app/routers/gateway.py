"""Payment gateway routes.

GET  /gateway/links/{token}          – mock gateway info page (no-auth)
POST /gateway/links/{token}/complete – mock gateway complete (no-auth)
GET  /gateway/status/{token}         – payment status check (no-auth, used by return page)
POST /gateway/webhook/cashfree       – Cashfree signed webhook (no-auth)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Instalment, Payment, PaymentAllocation, PaymentLink, Receipt, Student
from app.schemas import GatewayCompleteRequest
from app.services import cashfree as cf
from app.services import gateway as gw_svc

log = logging.getLogger(__name__)
router = APIRouter(prefix="/gateway", tags=["gateway"])


# ──────────────────────── mock gateway (no Cashfree) ──────────────────── #

@router.get("/links/{token}")
def get_link(token: str, db: Session = Depends(get_db)):
    """Public: show pay-link info for the built-in mock gateway page."""
    return gw_svc.get_link_info(db, token)


@router.post("/links/{token}/complete")
def complete_payment(
    token: str,
    body: GatewayCompleteRequest,
    db: Session = Depends(get_db),
):
    """Public: complete or fail a mock gateway payment."""
    return gw_svc.complete_online_payment(db, token, body.outcome)


# ──────────────────────── payment status (return page) ────────────────── #

@router.get("/status/{token}")
def payment_status(token: str, db: Session = Depends(get_db)):
    """Public: check whether a payment link has been paid.

    Used by the frontend PaymentReturn page after Cashfree redirect.
    Returns {status, receipt_id, amount_paise, student_name}.
    """
    link = db.execute(
        select(PaymentLink).where(PaymentLink.token == token)
    ).scalar_one_or_none()

    if link is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Link not found."}})

    # ACTIVE RECONCILIATION: If still open and Cashfree is configured, verify with Cashfree directly
    if link.status == "open" and cf.is_configured() and token.startswith("INST-"):
        try:
            cf_info = cf.get_payment_link(token)
            cf_status = (cf_info.get("link_status") or "").upper()
            if cf_status in ("PAID", "PARTIALLY_PAID"):
                cf_link_id = str(cf_info.get("cf_link_id") or token)
                paid_rupees = float(cf_info.get("link_amount_paid") or cf_info.get("link_amount") or 0)
                amount_paise = round(paid_rupees * 100) if paid_rupees > 0 else link.amount_paise
                gw_svc.mark_link_paid_from_cashfree(db, token, cf_link_id, amount_paise)
                db.refresh(link)
        except Exception as e:
            log.warning("Active reconciliation with Cashfree failed: %s", e)

    # Find receipt if paid
    receipt_id = None
    if link.status == "paid":
        # 1. Try finding payment directly associated with mock token
        mock_payment = db.execute(
            select(Payment).where(Payment.reference == f"MOCK-{token}")
        ).scalar_one_or_none()
        if mock_payment:
            r = db.execute(
                select(Receipt.id).where(Receipt.payment_id == mock_payment.id)
            ).scalar_one_or_none()
            if r:
                receipt_id = r

        # 2. Try finding receipt via payment allocations for this link's instalment
        if not receipt_id:
            r = db.execute(
                select(Receipt.id)
                .join(PaymentAllocation, PaymentAllocation.payment_id == Receipt.payment_id)
                .where(PaymentAllocation.instalment_id == link.instalment_id)
                .order_by(Receipt.id.desc())
            ).first()
            if r:
                receipt_id = r[0]

        # 3. Fallback: check latest receipt for the student
        if not receipt_id:
            instalment = db.get(Instalment, link.instalment_id)
            if instalment:
                r = db.execute(
                    select(Receipt.id)
                    .where(Receipt.student_id == instalment.student_id)
                    .order_by(Receipt.id.desc())
                ).first()
                if r:
                    receipt_id = r[0]

    # Get student name
    student_name = ""
    instalment_seq = 0
    try:
        inst = db.get(Instalment, link.instalment_id)
        if inst:
            instalment_seq = inst.seq
            s = db.get(Student, inst.student_id)
            if s:
                student_name = s.full_name
    except Exception:
        pass

    return {
        "token": token,
        "status": link.status,                # "open" | "paid" | "expired"
        "amount_paise": link.amount_paise,
        "student_name": student_name,
        "instalment_seq": instalment_seq,
        "receipt_id": receipt_id,
    }


# ──────────────────────── Cashfree webhook ────────────────────────────── #

@router.post("/webhook/cashfree", status_code=200)
async def cashfree_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_webhook_timestamp: str = Header(default=""),
    x_webhook_signature: str = Header(default=""),
):
    """Cashfree signed webhook handler.

    Cashfree sends payment events here. We verify the HMAC-SHA256 signature
    before processing.
    """
    raw_body = await request.body()
    ts = request.headers.get("x-webhook-timestamp") or x_webhook_timestamp
    sig = request.headers.get("x-webhook-signature") or x_webhook_signature

    # Verify signature
    if cf.is_configured():
        if not ts or not sig:
            log.warning("Cashfree webhook: missing signature headers (ts=%s, sig=%s)", ts, sig)
            raise HTTPException(status_code=400, detail="Missing webhook signature headers.")
        if not cf.verify_webhook_signature(raw_body, ts, sig):
            log.warning("Cashfree webhook: signature mismatch")
            raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    import json
    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    # Acknowledge Cashfree dashboard test webhooks
    event_type = payload.get("type", "")
    if "TEST" in event_type.upper():
        return {"ok": True, "message": "Test webhook verified and received."}

    result = gw_svc.handle_cashfree_webhook(db, payload)
    return {"ok": True, **result}
