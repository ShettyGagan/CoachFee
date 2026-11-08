"""Database models and schema definitions for coaching fee system."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Identity,
    Index, Integer, MetaData, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


def _in(col: str, values: list[str]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


def _pk() -> Mapped[int]:
    return mapped_column(BigInteger, Identity(), primary_key=True)


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


# ----------------------------- people & places ----------------------------- #
class Centre(Base):
    __tablename__ = "centres"
    id: Mapped[int] = _pk()
    name: Mapped[str] = mapped_column(String(120), unique=True)
    city: Mapped[str] = mapped_column(String(80))


class User(Base):
    """Staff: accounts, counsellor, admin. centre_id NULL = can see all centres."""
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ["accounts", "counsellor", "admin"]), name="role"),)
    id: Mapped[int] = _pk()
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    centre_id: Mapped[int | None] = mapped_column(ForeignKey("centres.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


class Guardian(Base):
    """Parent. One row per phone, so siblings share one login. Consent is stored here (DPDP)."""
    __tablename__ = "guardians"
    __table_args__ = (CheckConstraint(_in("language", ["en", "hi"]), name="language"),)
    id: Mapped[int] = _pk()
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(16), unique=True)  # E.164, +919000000001
    language: Mapped[str] = mapped_column(String(2), server_default="hi")
    consent_version: Mapped[str | None] = mapped_column(String(20))
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()


class Batch(Base):
    """A class group, with its fee settings. Instalments are generated from these."""
    __tablename__ = "batches"
    __table_args__ = (
        UniqueConstraint("centre_id", "name"),
        CheckConstraint(_in("course", ["JEE", "NEET"]), name="course"),
        CheckConstraint("course_end > course_start", name="course_dates"),
        CheckConstraint("total_fee_paise > 0", name="fee_positive"),
        CheckConstraint("registration_fee_paise BETWEEN 0 AND total_fee_paise", name="registration_range"),
        CheckConstraint("instalment_count BETWEEN 1 AND 12", name="instalment_range"),
    )
    id: Mapped[int] = _pk()
    centre_id: Mapped[int] = mapped_column(ForeignKey("centres.id"))
    name: Mapped[str] = mapped_column(String(120))  # "JEE 2027 Morning"
    course: Mapped[str] = mapped_column(String(10))
    course_start: Mapped[date] = mapped_column(Date)
    course_end: Mapped[date] = mapped_column(Date)
    total_fee_paise: Mapped[int] = mapped_column(BigInteger)
    registration_fee_paise: Mapped[int] = mapped_column(BigInteger, server_default="0")  # non-refundable
    instalment_count: Mapped[int] = mapped_column(Integer, server_default="4")
    first_due_date: Mapped[date] = mapped_column(Date)
    gap_months: Mapped[int] = mapped_column(Integer, server_default="3")


class Student(Base):
    """A student with their own frozen copy of the fee (batch fee changes never rewrite history)."""
    __tablename__ = "students"
    __table_args__ = (
        CheckConstraint(_in("status", ["active", "left", "completed"]), name="status"),
        CheckConstraint("discount_paise BETWEEN 0 AND gross_fee_paise", name="discount_range"),
        CheckConstraint("net_fee_paise = gross_fee_paise - discount_paise", name="net_matches"),
        Index("ix_students_batch_id", "batch_id"),
        Index("ix_students_guardian_id", "guardian_id"),
    )
    id: Mapped[int] = _pk()
    student_code: Mapped[str] = mapped_column(String(20), unique=True)  # STU-0587
    full_name: Mapped[str] = mapped_column(String(120))
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    guardian_id: Mapped[int] = mapped_column(ForeignKey("guardians.id"))
    status: Mapped[str] = mapped_column(String(12), server_default="active")
    enrolled_on: Mapped[date] = mapped_column(Date)
    left_on: Mapped[date | None] = mapped_column(Date)
    gross_fee_paise: Mapped[int] = mapped_column(BigInteger)
    discount_paise: Mapped[int] = mapped_column(BigInteger, server_default="0")
    discount_reason: Mapped[str | None] = mapped_column(String(200))
    net_fee_paise: Mapped[int] = mapped_column(BigInteger)
    registration_fee_paise: Mapped[int] = mapped_column(BigInteger, server_default="0")
    created_at: Mapped[datetime] = _now()


# --------------------------------- fees ------------------------------------ #
class Instalment(Base):
    __tablename__ = "instalments"
    __table_args__ = (
        UniqueConstraint("student_id", "seq"),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        Index("ix_instalments_due_date", "due_date"),
    )
    id: Mapped[int] = _pk()
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    seq: Mapped[int] = mapped_column(Integer)
    due_date: Mapped[date] = mapped_column(Date)
    amount_paise: Mapped[int] = mapped_column(BigInteger)


class Payment(Base):
    """Money received. student_id NULL = payer unknown. Unmatched = not fully allocated."""
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("method", "reference"),  # a repeated gateway callback can't double-pay
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint(_in("method", ["online", "cash", "cheque", "bank_transfer"]), name="method"),
        CheckConstraint(_in("status", ["pending", "succeeded", "failed"]), name="status"),
        Index("ix_payments_student_id", "student_id"),
    )
    id: Mapped[int] = _pk()
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str] = mapped_column(String(80))  # "MOCK-<token>" / UTR / "CASH-<uuid>"
    status: Mapped[str] = mapped_column(String(12), server_default="pending")
    received_at: Mapped[datetime] = _now()
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # NULL = parent online


class PaymentAllocation(Base):
    """Which payment paid which instalment (one payment can cover several; part payments are allowed)."""
    __tablename__ = "payment_allocations"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        Index("ix_payment_allocations_instalment_id", "instalment_id"),
        Index("ix_payment_allocations_payment_id", "payment_id"),
    )
    id: Mapped[int] = _pk()
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"))
    instalment_id: Mapped[int] = mapped_column(ForeignKey("instalments.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)


class PaymentLink(Base):
    """Pay link for one instalment (mock gateway, test mode). The pay page is /pay/<token>."""
    __tablename__ = "payment_links"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="amount_positive"),
        CheckConstraint(_in("status", ["open", "paid", "expired"]), name="status"),
        Index("ix_payment_links_instalment_id", "instalment_id"),
    )
    id: Mapped[int] = _pk()
    instalment_id: Mapped[int] = mapped_column(ForeignKey("instalments.id"))
    token: Mapped[str] = mapped_column(String(64), unique=True)  # secrets.token_urlsafe(32)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10), server_default="open")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()


class Receipt(Base):
    """GST snapshot. Never recalculated after issue."""
    __tablename__ = "receipts"
    __table_args__ = (
        CheckConstraint("total_paise = taxable_paise + cgst_paise + sgst_paise", name="gst_adds_up"),
    )
    id: Mapped[int] = _pk()
    receipt_no: Mapped[str] = mapped_column(String(30), unique=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), unique=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    total_paise: Mapped[int] = mapped_column(BigInteger)
    taxable_paise: Mapped[int] = mapped_column(BigInteger)
    cgst_paise: Mapped[int] = mapped_column(BigInteger)
    sgst_paise: Mapped[int] = mapped_column(BigInteger)
    gst_rate_bp: Mapped[int] = mapped_column(Integer)  # 1800 = 18%
    issued_at: Mapped[datetime] = _now()


# ------------------------- reminders & refunds ----------------------------- #
class Reminder(Base):
    """Scheduled reminder + its mock outbox record in one row."""
    __tablename__ = "reminders"
    __table_args__ = (
        UniqueConstraint("instalment_id", "kind"),  # re-running the job never duplicates
        CheckConstraint(
            _in("kind", ["before_7", "before_1", "on_due", "after_3", "after_7", "after_15"]), name="kind"
        ),
        CheckConstraint(_in("status", ["pending", "sent", "cancelled", "skipped"]), name="status"),
        Index("ix_reminders_status_scheduled_for", "status", "scheduled_for"),
    )
    id: Mapped[int] = _pk()
    instalment_id: Mapped[int] = mapped_column(ForeignKey("instalments.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(12))
    scheduled_for: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), server_default="pending")
    language: Mapped[str | None] = mapped_column(String(2))
    message: Mapped[str | None] = mapped_column(Text)  # text "sent" (mock)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(80))  # e.g. "paid before send"


class Refund(Base):
    __tablename__ = "refunds"
    __table_args__ = (
        CheckConstraint("refund_paise BETWEEN 0 AND total_paid_paise", name="refund_range"),
        CheckConstraint(_in("status", ["draft", "approved", "paid"]), name="status"),
    )
    id: Mapped[int] = _pk()
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    leave_date: Mapped[date] = mapped_column(Date)
    due_by: Mapped[date] = mapped_column(Date)  # leave_date + 10 days
    total_paid_paise: Mapped[int] = mapped_column(BigInteger)
    registration_fee_paise: Mapped[int] = mapped_column(BigInteger)
    consumed_fee_paise: Mapped[int] = mapped_column(BigInteger)
    refund_paise: Mapped[int] = mapped_column(BigInteger)
    calculation: Mapped[dict[str, Any]] = mapped_column(JSONB)  # full breakdown, explains any refund later
    status: Mapped[str] = mapped_column(String(10), server_default="draft")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _now()


# --------------------- attendance, scores, AI flag ------------------------- #
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("student_id", "date"),)
    id: Mapped[int] = _pk()
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    present: Mapped[bool] = mapped_column(Boolean)


class TestScore(Base):
    __tablename__ = "test_scores"
    __test__ = False  # keep pytest from collecting this class
    __table_args__ = (
        UniqueConstraint("student_id", "test_name"),
        CheckConstraint("max_score > 0 AND score BETWEEN 0 AND max_score", name="score_range"),
    )
    id: Mapped[int] = _pk()
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    test_name: Mapped[str] = mapped_column(String(80))
    test_date: Mapped[date] = mapped_column(Date)
    score: Mapped[int] = mapped_column(Integer)
    max_score: Mapped[int] = mapped_column(Integer)


class RiskFlag(Base):
    """Dropout-risk flag AND the counsellor's call task. It never triggers fees or parent messages."""
    __tablename__ = "risk_flags"
    __table_args__ = (
        CheckConstraint("score BETWEEN 0 AND 100", name="score_range"),
        CheckConstraint(_in("level", ["medium", "high"]), name="level"),
        CheckConstraint(_in("status", ["open", "called", "false_flag"]), name="status"),
        Index("uq_risk_flags_one_open", "student_id", unique=True, postgresql_where=text("status = 'open'")),
    )
    id: Mapped[int] = _pk()
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    score: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(10))
    reasons: Mapped[list[Any]] = mapped_column(JSONB)  # ["2 instalments overdue", "attendance down 18 pts"]
    status: Mapped[str] = mapped_column(String(12), server_default="open")
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()


# ------------------------------- views ------------------------------------- #
VIEWS_SQL = """
-- Balance, status and days overdue are computed here, never stored. "Today" is India time.
CREATE OR REPLACE VIEW instalment_status AS
SELECT i.id AS instalment_id, i.student_id, i.seq, i.due_date, i.amount_paise,
       COALESCE(SUM(a.amount_paise), 0)::bigint                     AS paid_paise,
       (i.amount_paise - COALESCE(SUM(a.amount_paise), 0))::bigint  AS balance_paise,
       CASE WHEN i.amount_paise > COALESCE(SUM(a.amount_paise), 0)
             AND i.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
            THEN (now() AT TIME ZONE 'Asia/Kolkata')::date - i.due_date
            ELSE 0 END                                              AS days_overdue
FROM instalments i
LEFT JOIN payment_allocations a ON a.instalment_id = i.id
GROUP BY i.id;

-- Accounts queue: succeeded payments that are not fully allocated to instalments.
CREATE OR REPLACE VIEW unmatched_payments AS
SELECT p.id AS payment_id, p.student_id, p.amount_paise, p.method, p.reference, p.received_at,
       (p.amount_paise - COALESCE(SUM(a.amount_paise), 0))::bigint AS unallocated_paise
FROM payments p
LEFT JOIN payment_allocations a ON a.payment_id = p.id
WHERE p.status = 'succeeded'
GROUP BY p.id
HAVING p.amount_paise > COALESCE(SUM(a.amount_paise), 0);
"""
