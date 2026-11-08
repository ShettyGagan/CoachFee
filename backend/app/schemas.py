"""
Pydantic v2 request / response schemas for the coaching fee system.

Conventions
-----------
* ``model_config = ConfigDict(extra="forbid")`` on every model.
* Money fields are integer paise (``*_paise``).
* Dates: ``YYYY-MM-DD``; timestamps: ISO-8601 with offset.
* Phone input: ``+91XXXXXXXXXX``; masked in staff lists via ``mask_phone``.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    model_validator,
)


# ───────────────────────── utility ──────────────────────────────── #

def mask_phone(phone: str) -> str:
    """Mask a phone number for staff list responses.

    ``+919000000001`` → ``+91 90•••••01``
    """
    digits = re.sub(r"[^\d]", "", phone)      # strip everything but digits
    if len(digits) < 4:
        return phone
    # Country code: first (len-10) digits, then 2 visible + 5 masked + 2 visible + last digit
    cc = digits[:-10] if len(digits) > 10 else ""
    local = digits[-10:] if len(digits) >= 10 else digits
    return f"+{cc} {local[:2]}•••••{local[-2:]}"


# ═══════════════════════════════════════════════════════════════════ #
#                               AUTH                                #
# ═══════════════════════════════════════════════════════════════════ #

class StaffLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1)


class ParentVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_token: str = Field(min_length=1)


class StaffMeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["staff"] = "staff"
    id: int
    name: str
    role: str
    centre_id: int | None = None


class GuardianMeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["guardian"] = "guardian"
    id: int
    name: str
    language: str
    needs_consent: bool


# ═══════════════════════════════════════════════════════════════════ #
#                         CENTRES / BATCHES                         #
# ══════════════════════════════════════════════════════════════════ #

class CentreCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=80)


class CentreOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    name: str
    city: str


class BatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    centre_id: int
    name: str = Field(min_length=1, max_length=120)
    course: Literal["JEE", "NEET"]
    course_start: date
    course_end: date
    total_fee_paise: int = Field(gt=0)
    registration_fee_paise: int = Field(ge=0, default=0)
    instalment_count: int = Field(ge=1, le=12, default=4)
    first_due_date: date
    gap_months: int = Field(ge=1, default=3)

    @model_validator(mode="after")
    def _validate(self) -> BatchCreate:
        if self.course_end <= self.course_start:
            raise ValueError("course_end must be after course_start")
        if self.registration_fee_paise > self.total_fee_paise:
            raise ValueError("registration_fee_paise cannot exceed total_fee_paise")
        return self


class BatchOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    name: str
    centre_id: int
    centre_name: str
    course: str
    course_start: date
    course_end: date
    total_fee_paise: int
    registration_fee_paise: int
    instalment_count: int
    first_due_date: date
    gap_months: int


# ═══════════════════════════════════════════════════════════════════ #
#                            STUDENTS                               #
# ═══════════════════════════════════════════════════════════════════ #

class StudentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=1, max_length=120)
    batch_id: int
    guardian_name: str = Field(min_length=1, max_length=120)
    guardian_phone: str = Field(pattern=r"^\+91\d{10}$")
    language: Literal["en", "hi"] = "hi"
    discount_paise: int = Field(ge=0, default=0)
    discount_reason: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> StudentCreate:
        if self.discount_paise > 0 and not self.discount_reason:
            raise ValueError("discount_reason is required when discount_paise > 0")
        return self


class StudentListItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int
    student_id: int | None = None
    student_code: str
    full_name: str
    name: str | None = None
    batch: str
    batch_name: str | None = None
    centre: str
    centre_name: str | None = None
    guardian_phone: str
    status: str
    balance_paise: int
    max_days_overdue: int
    days_overdue: int | None = None


class StudentListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    centre_id: int | None = None
    batch_id: int | None = None
    q: str | None = None
    status: str | None = None
    overdue_only: bool = False
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# ═══════════════════════════════════════════════════════════════════ #
#                             LEDGER                                #
# ═══════════════════════════════════════════════════════════════════ #

class GuardianInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    phone: str
    language: str


class StudentInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    student_code: str
    full_name: str
    status: str
    batch: str
    gross_fee_paise: int
    discount_paise: int
    net_fee_paise: int
    guardian: GuardianInfo


class InstalmentInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    seq: int
    due_date: date
    amount_paise: int
    paid_paise: int
    balance_paise: int
    days_overdue: int
    status: str


class PaymentInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    amount_paise: int
    method: str
    reference: str
    received_at: datetime
    receipt_id: int | None = None


class LedgerTotals(BaseModel):
    model_config = ConfigDict(extra="forbid")
    paid_paise: int
    balance_paise: int


class LedgerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student: StudentInfo
    totals: LedgerTotals
    instalments: list[InstalmentInfo]
    payments: list[PaymentInfo]
    open_risk_flag: dict[str, Any] | None = None


# ═══════════════════════════════════════════════════════════════════ #
#                            PAYMENTS                               #
# ═══════════════════════════════════════════════════════════════════ #

class PaymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int | None = None
    amount_paise: int = Field(gt=0)
    method: Literal["cash", "cheque", "bank_transfer"]
    reference: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> PaymentCreate:
        if self.method in ("cheque", "bank_transfer") and not self.reference:
            raise ValueError("reference is required for cheque and bank_transfer payments")
        return self


class AllocationOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instalment_id: int
    amount_paise: int


class PaymentResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment: dict[str, Any]
    allocations: list[AllocationOut]
    receipt_id: int | None = None
    unallocated_paise: int


class AllocateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int


class UnmatchedPaymentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment_id: int
    student_id: int | None = None
    amount_paise: int
    unallocated_paise: int
    method: str
    reference: str
    received_at: datetime


# ═══════════════════════════════════════════════════════════════════ #
#                            RECEIPTS                               #
# ═══════════════════════════════════════════════════════════════════ #

class ReceiptOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receipt_no: str
    issued_at: datetime
    student: dict[str, Any]       # {student_code, full_name}
    total_paise: int
    taxable_paise: int
    cgst_paise: int
    sgst_paise: int
    gst_rate_bp: int
    payment: dict[str, Any]       # {method, reference}


# ═══════════════════════════════════════════════════════════════════ #
#                         PARENT PORTAL                             #
# ═══════════════════════════════════════════════════════════════════ #

class ConsentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_version: str = Field(min_length=1)


class ChildSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int
    name: str
    batch: str
    total_balance_paise: int
    next_due: dict[str, Any] | None = None


class DuesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student: dict[str, Any]
    next_due: dict[str, Any] | None = None
    total_balance_paise: int
    instalments: list[InstalmentInfo]


class ParentReceiptListItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    receipt_no: str
    issued_at: datetime
    total_paise: int


# ═══════════════════════════════════════════════════════════════════ #
#                          PAY LINKS                                #
# ═══════════════════════════════════════════════════════════════════ #

class PayLinkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str
    amount_paise: int
    expires_at: datetime


class GatewayLinkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    institute: str
    student_first_name: str
    instalment_seq: int
    amount_paise: int
    status: str
    expires_at: datetime
    receipt_id: int | None = None


class GatewayCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    outcome: Literal["success", "failure"]


class GatewayCompleteOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    receipt_id: int | None = None
    already_paid: bool = False


# ═══════════════════════════════════════════════════════════════════ #
#                           REMINDERS                               #
# ═══════════════════════════════════════════════════════════════════ #

class ReminderOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    student_code: str
    student_name: str
    kind: str
    scheduled_for: date
    status: str
    language: str | None = None
    message: str | None = None
    sent_at: datetime | None = None
    note: str | None = None


class ReminderJobResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created: int
    sent: int
    skipped: int


# ═══════════════════════════════════════════════════════════════════ #
#                            REFUNDS                                #
# ═══════════════════════════════════════════════════════════════════ #

class RefundPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int
    leave_date: date


class RefundPreviewOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int
    leave_date: date
    due_by: date
    course_days: int
    days_attended: int
    net_fee_paise: int
    total_paid_paise: int
    registration_fee_paise: int
    consumed_fee_paise: int
    refund_paise: int
    formula: str


class RefundOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    student_code: str
    student_name: str
    leave_date: date
    due_by: date
    refund_paise: int
    status: str
    overdue: bool


class RefundStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["approved", "paid"]


# ═══════════════════════════════════════════════════════════════════ #
#                           DASHBOARD                               #
# ═══════════════════════════════════════════════════════════════════ #

class DashboardSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    billed_paise: int
    collected_paise: int
    outstanding_paise: int
    overdue_paise: int
    unmatched_count: int
    unmatched_paise: int


class DuesGroupItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    name: str
    students: int
    outstanding_paise: int
    overdue_paise: int


class AgeingBucket(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bucket: str
    amount_paise: int
    students: int


class AgeingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    buckets: list[AgeingBucket]


# ═══════════════════════════════════════════════════════════════════ #
#                          RISK FLAGS                               #
# ═══════════════════════════════════════════════════════════════════ #

class RiskFlagOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    student: dict[str, Any]       # {id, student_code, full_name, batch}
    guardian_phone: str
    score: int
    level: str
    reasons: list[str]
    status: str
    note: str | None = None
    created_at: datetime


class RiskFlagUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["called", "false_flag"]
    note: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> RiskFlagUpdate:
        if self.status == "false_flag" and not self.note:
            raise ValueError("note is required when status is false_flag")
        return self


class RiskJobResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scored: int
    flagged: int
    updated: int
    skipped_cooldown: int


# ═══════════════════════════════════════════════════════════════════ #
#                          PAGINATION                               #
# ═══════════════════════════════════════════════════════════════════ #

class PaginatedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[Any]
    total: int
