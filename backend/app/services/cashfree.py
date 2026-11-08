"""Cashfree Payment Gateway API client (Payment Links v3).

Docs: https://docs.cashfree.com/docs/payment-links-api

Environment variables required:
    CASHFREE_APP_ID     – your Cashfree App ID
    CASHFREE_SECRET_KEY – your Cashfree Secret Key
    CASHFREE_ENV        – "sandbox" | "production"  (default: sandbox)
    FRONTEND_URL        – base URL of the frontend (for return_url)

Leave CASHFREE_APP_ID empty to fall back to the built-in mock gateway.
"""
from __future__ import annotations

import hashlib
import hmac
import base64
from datetime import datetime, timezone, timedelta

import httpx

from app.config import get_settings, PAY_LINK_TTL_HOURS


def _base_url() -> str:
    s = get_settings()
    if s.CASHFREE_ENV == "production":
        return "https://api.cashfree.com/pg"
    return "https://sandbox.cashfree.com/pg"


def _headers() -> dict:
    s = get_settings()
    return {
        "x-client-id": s.CASHFREE_APP_ID,
        "x-client-secret": s.CASHFREE_SECRET_KEY,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    """Return True when Cashfree credentials are present in settings."""
    s = get_settings()
    return bool(s.CASHFREE_APP_ID and s.CASHFREE_SECRET_KEY)


# ─────────────────────────── Payment Links ─────────────────────────────── #

def create_payment_link(
    *,
    link_id: str,
    amount_paise: int,
    purpose: str,
    customer_name: str,
    customer_phone: str,
) -> dict:
    """Create a Cashfree Payment Link. Returns the full API response dict.

    Raises ``httpx.HTTPStatusError`` on API error.
    """
    s = get_settings()
    # Clean phone: Cashfree expects 10 digits without country code prefix
    digits = "".join(c for c in customer_phone if c.isdigit())
    phone_10 = digits[-10:] if len(digits) >= 10 else digits

    # ISO8601 UTC format: YYYY-MM-DDTHH:MM:SSZ
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=PAY_LINK_TTL_HOURS)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    return_url = (
        f"{s.FRONTEND_URL}/payment/return"
        f"?cf_link_id={link_id}"
    )

    payload = {
        "link_id": link_id,
        "link_amount": round(amount_paise / 100, 2),  # Cashfree uses rupees
        "link_currency": "INR",
        "link_purpose": purpose[:100],  # max 100 chars
        "customer_details": {
            "customer_phone": phone_10,
            "customer_name": customer_name[:100],
        },
        "link_expiry_time": expires_at,
        "link_notify": {"send_sms": False, "send_email": False},
        "link_meta": {"return_url": return_url},
    }

    with httpx.Client(timeout=10) as client:
        resp = client.post(
            f"{_base_url()}/links",
            json=payload,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


def get_payment_link(link_id: str) -> dict:
    """Fetch current status of a Cashfree Payment Link."""
    with httpx.Client(timeout=10) as client:
        resp = client.get(
            f"{_base_url()}/links/{link_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


def get_link_payments(link_id: str) -> list[dict]:
    """Fetch all payments made against a Payment Link."""
    with httpx.Client(timeout=10) as client:
        resp = client.get(
            f"{_base_url()}/links/{link_id}/payments",
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        # API returns list directly or {"data": [...]}
        if isinstance(data, list):
            return data
        return data.get("data", [])


# ─────────────────────────── Webhook verification ──────────────────────── #

def verify_webhook_signature(raw_body: bytes, timestamp: str, signature: str) -> bool:
    """Verify Cashfree webhook HMAC-SHA256 signature.

    Cashfree formula: Base64(HMAC-SHA256(timestamp + raw_body, secret_key))
    """
    s = get_settings()
    secret = s.CASHFREE_SECRET_KEY.strip().strip("'\"").encode("utf-8")
    ts = timestamp.strip()
    sig = signature.strip()

    # 1. Standard Cashfree format: timestamp + raw_body
    message = ts.encode("utf-8") + raw_body
    computed = base64.b64encode(
        hmac.new(secret, message, hashlib.sha256).digest()
    ).decode("utf-8")
    if hmac.compare_digest(computed, sig):
        return True

    # 2. Fallback format (with newline): timestamp + "\n" + raw_body
    message_nl = (ts + "\n").encode("utf-8") + raw_body
    computed_nl = base64.b64encode(
        hmac.new(secret, message_nl, hashlib.sha256).digest()
    ).decode("utf-8")
    if hmac.compare_digest(computed_nl, sig):
        return True

    return False
