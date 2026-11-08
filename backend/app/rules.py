"""Pure business rules for the coaching fee system.

Every function here is pure: no database access, no FastAPI, no network calls.
"Today" is always passed in as a parameter when needed.
Money is always integer paise.
"""

from __future__ import annotations

import calendar
import math
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.config import REMINDER_OFFSETS


# ---------------------------------------------------------------------------
# 1. Instalments
# ---------------------------------------------------------------------------

def build_instalments(
    net_fee_paise: int,
    count: int,
    first_due_date: date,
    gap_months: int,
) -> list[dict]:
    """Split *net_fee_paise* into *count* equal instalments.

    Due-date k = first_due_date + k × gap_months months (k = 0 … count-1).
    If the target day doesn't exist in the month, clamp to the last day of
    that month (e.g. Jan 31 + 1 month → Feb 28/29).

    The last instalment absorbs the remainder so the sum equals
    *net_fee_paise* exactly.

    Returns a list of ``{"seq": int, "due_date": date, "amount_paise": int}``.
    ``seq`` starts at 1.
    """
    if count <= 0:
        return []

    base_amount = net_fee_paise // count
    instalments: list[dict] = []

    for k in range(count):
        due = _add_months(first_due_date, k * gap_months)

        if k < count - 1:
            amount = base_amount
        else:
            # Last instalment absorbs the remainder
            amount = net_fee_paise - base_amount * (count - 1)

        instalments.append({
            "seq": k + 1,
            "due_date": due,
            "amount_paise": amount,
        })

    return instalments


def _add_months(start: date, months: int) -> date:
    """Add *months* calendar months to *start*, clamping to month-end."""
    month = start.month - 1 + months
    year = start.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    day = min(start.day, max_day)
    return date(year, month, day)


# ---------------------------------------------------------------------------
# 2. FIFO allocation
# ---------------------------------------------------------------------------

def allocate_fifo(
    amount_paise: int,
    open_instalments: list[dict],
) -> tuple[list[dict], int]:
    """Allocate *amount_paise* across *open_instalments* oldest-first (FIFO).

    *open_instalments* must be sorted by ``due_date`` ascending, each dict
    having ``{"instalment_id": int, "balance_paise": int}``.

    Returns ``(allocations, unallocated_paise)`` where *allocations* is a list
    of ``{"instalment_id": int, "amount_paise": int}`` and
    *unallocated_paise* is whatever is left after all open instalments are
    fully paid.
    """
    remaining = amount_paise
    allocations: list[dict] = []

    for inst in open_instalments:
        if remaining <= 0:
            break
        pay = min(remaining, inst["balance_paise"])
        if pay > 0:
            allocations.append({
                "instalment_id": inst["instalment_id"],
                "amount_paise": pay,
            })
            remaining -= pay

    return allocations, remaining


# ---------------------------------------------------------------------------
# 3. GST
# ---------------------------------------------------------------------------

def compute_gst(total_paise: int, rate_bp: int = 1800) -> dict:
    """Break a GST-inclusive total into taxable, CGST and SGST (intra-state).

    *rate_bp* is the GST rate in basis points (1800 = 18 %).

    Formula:
        taxable = round_half_up(total × 10000 / (10000 + rate_bp))
        cgst    = (total − taxable) // 2
        sgst    = total − taxable − cgst

    Returns ``{"taxable_paise": int, "cgst_paise": int, "sgst_paise": int}``.
    """
    total_d = Decimal(total_paise)
    rate_d = Decimal(rate_bp)
    taxable = int(
        (total_d * Decimal(10000) / (Decimal(10000) + rate_d))
        .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    gst_total = total_paise - taxable
    cgst = gst_total // 2
    sgst = gst_total - cgst
    return {
        "taxable_paise": taxable,
        "cgst_paise": cgst,
        "sgst_paise": sgst,
    }


# ---------------------------------------------------------------------------
# 4. Receipt number
# ---------------------------------------------------------------------------

def generate_receipt_no(year: int, sequence: int) -> str:
    """Generate a receipt number like ``RCPT-2026-000004``."""
    return f"RCPT-{year}-{sequence:06d}"


# ---------------------------------------------------------------------------
# 5. Instalment status
# ---------------------------------------------------------------------------

def instalment_status(
    due_date: date,
    amount_paise: int,
    paid_paise: int,
    today: date,
) -> str:
    """Derive the display status of an instalment.

    Returns one of:
        ``"paid"`` | ``"upcoming"`` | ``"part_paid"``
        | ``"overdue"`` | ``"part_paid_overdue"``
    """
    if paid_paise >= amount_paise:
        return "paid"
    if due_date > today:
        if paid_paise > 0:
            return "part_paid"
        return "upcoming"
    # due_date <= today
    if paid_paise > 0:
        return "part_paid_overdue"
    return "overdue"


# ---------------------------------------------------------------------------
# 6. Refund
# ---------------------------------------------------------------------------

def compute_refund(
    net_fee_paise: int,
    total_paid_paise: int,
    registration_fee_paise: int,
    course_start: date,
    course_end: date,
    leave_date: date,
) -> dict:
    """Compute a pro-rata refund for a student who is leaving.

    Registration fee is non-refundable.  The consumed fee is the pro-rata
    portion of ``net_fee_paise`` for days attended.  The refund is clamped
    between 0 and ``total_paid_paise``.

    Returns a full breakdown dict including the formula string.
    """
    course_days = (course_end - course_start).days
    if course_days <= 0:
        course_days = 1  # safety: avoid division by zero

    raw_days_attended = (leave_date - course_start).days
    days_attended = max(0, min(raw_days_attended, course_days))

    consumed = int(
        (Decimal(net_fee_paise) * Decimal(days_attended) / Decimal(course_days))
        .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )

    raw_refund = total_paid_paise - registration_fee_paise - consumed
    refund = max(0, min(raw_refund, total_paid_paise))

    due_by = leave_date + timedelta(days=10)

    return {
        "leave_date": leave_date,
        "due_by": due_by,
        "course_days": course_days,
        "days_attended": days_attended,
        "net_fee_paise": net_fee_paise,
        "total_paid_paise": total_paid_paise,
        "registration_fee_paise": registration_fee_paise,
        "consumed_fee_paise": consumed,
        "refund_paise": refund,
        "formula": "paid - registration - net_fee * days_attended / course_days",
    }


# ---------------------------------------------------------------------------
# 7. Reminder schedule
# ---------------------------------------------------------------------------

_REMINDER_OFFSETS: list[tuple[str, int]] = list(REMINDER_OFFSETS.items())
_KIND_ORDER: dict[str, int] = {kind: i for i, (kind, _) in enumerate(_REMINDER_OFFSETS)}


def reminder_schedule(due_date: date) -> list[dict]:
    """Return the six reminder dates for a given instalment due date.

    Returns ``[{"kind": str, "scheduled_for": date}, ...]``.
    """
    return [
        {"kind": kind, "scheduled_for": due_date + timedelta(days=offset)}
        for kind, offset in _REMINDER_OFFSETS
    ]


def pick_latest_due_reminder(
    reminders: list[dict],
    today: date,
) -> tuple[dict | None, list[dict]]:
    """Given pending reminders for an instalment, return (latest_due, older_superseded).

    Only considers reminders where scheduled_for <= today.
    The latest reminder (by offset order) is the single candidate to send.
    Any earlier due reminders for this instalment in this run are to be marked skipped (superseded).
    """
    due_reminders = [r for r in reminders if r["scheduled_for"] <= today]
    if not due_reminders:
        return None, []

    # Sort by kind order in _KIND_ORDER
    due_reminders.sort(key=lambda r: _KIND_ORDER.get(r["kind"], 0))
    latest = due_reminders[-1]
    superseded = due_reminders[:-1]
    return latest, superseded


# ---------------------------------------------------------------------------
# 8. Should skip reminder
# ---------------------------------------------------------------------------

def should_skip_reminder(
    balance_paise: int,
    student_status: str,
    has_consent: bool,
    scheduled_for: date,
    today: date,
    latest_due_kind: str | None = None,
    is_superseded: bool = False,
) -> tuple[bool, str | None]:
    """Decide whether a pending reminder should be skipped at send time.

    *balance_paise*: current amount remaining for the instalment.
    *student_status*: "active", "left", etc.
    *has_consent*: whether guardian gave DPDP consent.
    *is_superseded*: whether an older reminder is superseded by a newer due one.
    *latest_due_kind*: for backwards-compatible stale check.

    Returns ``(should_skip, reason)``.
    """
    if balance_paise <= 0:
        return True, "paid before send"
    if student_status != "active":
        return True, "student left"
    if not has_consent:
        return True, "no consent"
    if is_superseded:
        return True, "superseded"
    # Stale check: scheduled_for is more than 3 days old AND a later
    # reminder for the same instalment is also due
    if (
        latest_due_kind is not None
        and (today - scheduled_for).days > 3
    ):
        return True, "stale"
    return False, None


# ---------------------------------------------------------------------------
# 9. Reminder message templates
# ---------------------------------------------------------------------------

_TEMPLATES: dict[str, dict[str, str]] = {
    "en": {
        # Friendly tone before due date
        "before_7": (
            "Dear {guardian}, this is a gentle reminder that the upcoming fee instalment of {amount} for {student} "
            "is due on {due_date}. Please visit the parent portal to view details and complete the payment."
        ),
        "before_1": (
            "Dear {guardian}, friendly reminder that {student}'s fee instalment of {amount} "
            "is due tomorrow ({due_date}). Please pay conveniently via the parent portal."
        ),
        # Direct tone on due date
        "on_due": (
            "Dear {guardian}, {student}'s fee instalment of {amount} is due today "
            "({due_date}). Please make the payment today via the parent portal."
        ),
        # Firmer (never threatening) tone once overdue
        "after_3": (
            "Dear {guardian}, the fee instalment of {amount} for {student} was due on "
            "{due_date} and is now overdue. Please clear the pending dues via the parent portal."
        ),
        "after_7": (
            "Dear {guardian}, please note that the fee instalment of {amount} for {student} is 7 days "
            "overdue (due {due_date}). Please arrange to settle the outstanding amount via the parent portal."
        ),
        "after_15": (
            "Dear {guardian}, the fee instalment of {amount} for {student} is now "
            "15 days overdue (due {due_date}). Please pay immediately via the parent portal to keep the account current."
        ),
    },
    "hi": {
        # Friendly tone before due date
        "before_7": (
            "नमस्ते {guardian}, {student} की आगामी फीस किस्त {amount} की "
            "अंतिम तिथि {due_date} है। कृपया पैरेंट पोर्टल पर जाकर आसानी से भुगतान करें।"
        ),
        "before_1": (
            "नमस्ते {guardian}, {student} की फीस किस्त {amount} कल "
            "({due_date}) देय है। कृपया पैरेंट पोर्टल के माध्यम से भुगतान पूरा करें।"
        ),
        # Direct tone on due date
        "on_due": (
            "{student} की फीस किस्त {amount} आज ({due_date}) "
            "देय है। कृपया आज ही पैरेंट पोर्टल से भुगतान करें।"
        ),
        # Firmer (never threatening) tone once overdue
        "after_3": (
            "{student} की फीस किस्त {amount} {due_date} को देय थी "
            "और अब बकाया है। कृपया पैरेंट पोर्टल पर शीघ्र भुगतान करें।"
        ),
        "after_7": (
            "ध्यान दें: {student} की फीस किस्त {amount} 7 दिनों से "
            "अतिदेय है (देय {due_date})। कृपया पैरेंट पोर्टल पर शीघ्र अतिशीघ्र भुगतान करें।"
        ),
        "after_15": (
            "अंतिम सूचना: {student} की फीस किस्त {amount} 15 दिनों "
            "से अतिदेय है (देय {due_date})। कृपया खाते को नियमित रखने के लिए तुरंत पैरेंट पोर्टल से भुगतान करें।"
        ),
    },
}


def build_reminder_message(
    kind: str,
    student_name: str,
    instalment_seq: int,
    amount_paise: int,
    due_date: date,
    language: str,
    guardian_name: str = "",
) -> str:
    """Build a reminder SMS/message from templates.

    *language* should be ``"en"`` or ``"hi"``; defaults to ``"en"`` if unknown.
    Uses student's first name, amount remaining (Indian grouping), and due date.
    Points the parent to the parent portal. Contains no phone numbers and no links.
    """
    lang_templates = _TEMPLATES.get(language, _TEMPLATES["en"])
    template = lang_templates.get(kind, lang_templates["on_due"])

    # Extract first name
    student_first_name = student_name.strip().split()[0] if student_name else "Student"
    formatted_amount = format_paise_as_rupees(amount_paise)
    date_str = due_date.strftime("%d %b %Y") if hasattr(due_date, "strftime") else str(due_date)

    return template.format(
        guardian=guardian_name or "Parent",
        student=student_first_name,
        seq=instalment_seq,
        amount=formatted_amount,
        due_date=date_str,
    )


# ---------------------------------------------------------------------------
# 10. Risk score
# ---------------------------------------------------------------------------

def compute_risk_score(
    overdue_instalments: int,
    max_days_overdue: int,
    attendance_recent: float | None,
    attendance_previous: float | None,
    test_scores: list[float],
) -> dict:
    """Compute an explainable risk score (0-100) for a student.

    *attendance_recent* / *attendance_previous* are percentages (0–100) for
    the last 4 weeks and the previous 4 weeks respectively, or ``None`` when
    data is unavailable.

    *test_scores* are the last 5 test scores as percentage-of-max (0–100).

    Returns ``{"score": int, "level": str | None, "reasons": list[str]}``.
    """
    reasons: list[str] = []

    # --- Overdue fees (max 40) ---
    fee_raw = 10 * overdue_instalments + max_days_overdue / 3
    fee_score = min(40, fee_raw)
    if fee_score > 0:
        reasons.append(
            f"{overdue_instalments} instalment{'s' if overdue_instalments != 1 else ''} "
            f"overdue (max {max_days_overdue} days)"
        )

    # --- Attendance drop (max 35) ---
    att_score: float = 0
    if attendance_recent is not None and attendance_previous is not None:
        drop = attendance_previous - attendance_recent
        if drop > 0:
            if drop >= 25:
                att_score = 35
            else:
                att_score = 35 * drop / 25
            reasons.append(
                f"Attendance fell from {attendance_previous:.0f}% "
                f"to {attendance_recent:.0f}%"
            )

    # --- Test trend (max 25) ---
    test_score: float = 0
    if len(test_scores) >= 3:
        scores = test_scores[-5:]  # last 5
        n = len(scores)
        # Simple linear regression slope
        x_mean = (n - 1) / 2
        y_mean = sum(scores) / n
        num = sum((i - x_mean) * (s - y_mean) for i, s in enumerate(scores))
        den = sum((i - x_mean) ** 2 for i in range(n))
        slope = num / den if den != 0 else 0
        # slope is per-test change in %-of-max
        # "falling 15+ points" means slope * (n-1) <= -15, but spec says
        # "slope of last 5 tests as % of max; falling 15+"
        # We interpret: total decline = -slope * (n-1), i.e. how much the
        # trend line drops from first to last test.
        # Actually, the spec says "slope … falling 15+ points = 25, linear below"
        # We interpret slope as the per-test change; a falling value of 15+ means
        # the slope magnitude >= 15 percentage points per test.
        # But that seems too steep. More likely: the slope is the per-test
        # change, and the total drop over the series matters.
        # Let's use: decline = max(0, -slope) as the magnitude of negative slope
        decline = max(0.0, -slope)
        if decline >= 15:
            test_score = 25
        else:
            test_score = 25 * decline / 15
        if decline > 0:
            reasons.append(
                f"Test scores declining (slope {slope:+.1f}% per test)"
            )

    total = fee_score + att_score + test_score
    score = min(100, int(math.ceil(total)))

    if score >= 60:
        level: str | None = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = None

    return {"score": score, "level": level, "reasons": reasons}


# ---------------------------------------------------------------------------
# 11. Ageing bucket
# ---------------------------------------------------------------------------

def ageing_bucket(days_overdue: int) -> str:
    """Classify an overdue instalment into an ageing bucket.

    Returns one of ``"not_yet_due"``, ``"1-30"``, ``"31-60"``, ``"over_60"``.
    """
    if days_overdue <= 0:
        return "not_yet_due"
    if days_overdue <= 30:
        return "1-30"
    if days_overdue <= 60:
        return "31-60"
    return "over_60"


# ---------------------------------------------------------------------------
# 12. Phone masking
# ---------------------------------------------------------------------------

def mask_phone(phone: str) -> str:
    """Mask a phone number for display in staff list views.

    ``+919000000001`` → ``+91 90•••••01``
    """
    if not phone or len(phone) < 6:
        return phone
    # Assume +91XXXXXXXXXX format (13 chars)
    # Country code = +91, then 10 digits
    if phone.startswith("+91") and len(phone) == 13:
        digits = phone[3:]  # 10 digits
        return f"+91 {digits[:2]}•••••{digits[-2:]}"
    # Generic fallback: show first 4 and last 2
    return phone[:4] + "•" * (len(phone) - 6) + phone[-2:]


# ---------------------------------------------------------------------------
# 13. Format paise as rupees (Indian numbering system)
# ---------------------------------------------------------------------------

def format_inr(number: int) -> str:
    """Format an integer with Indian comma grouping (e.g. 15,000, 1,50,000)."""
    s = str(abs(number))
    if len(s) <= 3:
        res = s
    else:
        res = s[-3:]
        s = s[:-3]
        while s:
            res = s[-2:] + "," + res
            s = s[:-2]
    return ("-" if number < 0 else "") + res


def format_paise_as_rupees(paise: int) -> str:
    """Format an integer paise value as a rupee string for display.

    ``1500000`` → ``"₹15,000"``
    ``15000000`` → ``"₹1,50,000"``
    ``150075`` → ``"₹1,500.75"``
    """
    rupees = paise // 100
    remaining_paise = paise % 100
    rupee_str = format_inr(rupees)

    if remaining_paise > 0:
        return f"₹{rupee_str}.{remaining_paise:02d}"
    return f"₹{rupee_str}"
