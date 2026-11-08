"""Seed demo data: ~130 students across 4 centres, with attendance, test scores,
payments, and risk flag triggers.

Dates are relative to today so the anchors always hold.
Run: python -m seed
"""
from __future__ import annotations

import random
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

from app.config import GST_RATE_BP
from app.db import SessionLocal, engine
from app.models import (
    AttendanceRecord, Base, Batch, Centre, Guardian, Instalment,
    Payment, PaymentAllocation, Receipt, Student, TestScore, User,
)
from app.rules import allocate_fifo, build_instalments, compute_gst, generate_receipt_no
from app.security import hash_password


def _india_today() -> date:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


TODAY = _india_today()

# ─────────────────────── helpers ──────────────────────────────── #

_student_counter = 0
_receipt_counter = 0

def _next_student_code() -> str:
    global _student_counter
    _student_counter += 1
    return f"STU-{_student_counter:04d}"

def _next_receipt_no() -> str:
    global _receipt_counter
    _receipt_counter += 1
    return generate_receipt_no(TODAY.year, _receipt_counter)


FIRST_NAMES = [
    "Aarav", "Ishita", "Mohit", "Priya", "Rahul", "Sneha", "Vikram", "Ananya",
    "Rohan", "Kavya", "Arjun", "Divya", "Karan", "Meera", "Sahil", "Pooja",
    "Dev", "Riya", "Aditya", "Nisha", "Yash", "Simran", "Varun", "Tanvi",
    "Harsh", "Neha", "Akash", "Swati", "Manish", "Deepika",
]
LAST_NAMES = [
    "Sharma", "Meena", "Gurjar", "Singh", "Verma", "Joshi", "Patel", "Gupta",
    "Kumar", "Yadav", "Agarwal", "Chauhan", "Rajput", "Saxena", "Mishra",
]

def _random_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def _make_payment_and_allocate(db, student, amount_paise, method, recorded_by, instalments_data):
    """Record a payment, FIFO allocate, and issue receipt."""
    ref = f"CASH-{uuid.uuid4().hex[:12]}" if method == "cash" else f"UTR{random.randint(100000, 999999)}"

    payment = Payment(
        student_id=student.id,
        amount_paise=amount_paise,
        method=method,
        reference=ref,
        status="succeeded",
        recorded_by=recorded_by,
    )
    db.add(payment)
    db.flush()

    # FIFO allocate
    open_insts = [
        {"instalment_id": i["id"], "balance_paise": i["balance"]}
        for i in instalments_data if i["balance"] > 0
    ]
    allocs, _ = allocate_fifo(amount_paise, open_insts)
    for a in allocs:
        db.add(PaymentAllocation(
            payment_id=payment.id,
            instalment_id=a["instalment_id"],
            amount_paise=a["amount_paise"],
        ))
        # update local tracking
        for i in instalments_data:
            if i["id"] == a["instalment_id"]:
                i["balance"] -= a["amount_paise"]

    db.flush()

    # receipt
    gst = compute_gst(amount_paise, GST_RATE_BP)
    receipt = Receipt(
        receipt_no=_next_receipt_no(),
        payment_id=payment.id,
        student_id=student.id,
        total_paise=amount_paise,
        taxable_paise=gst["taxable_paise"],
        cgst_paise=gst["cgst_paise"],
        sgst_paise=gst["sgst_paise"],
        gst_rate_bp=GST_RATE_BP,
    )
    db.add(receipt)
    db.flush()
    return payment


def seed():
    db = SessionLocal()

    try:
        # ─────────────── clear existing data ─────────────── #
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.flush()

        # ─────────────── centres ─────────────────────────── #
        centres = []
        for name, city in [
            ("Jaipur Main", "Jaipur"),
            ("Jaipur South", "Jaipur"),
            ("Kota Centre", "Kota"),
            ("Jodhpur Centre", "Jodhpur"),
        ]:
            c = Centre(name=name, city=city)
            db.add(c)
            centres.append(c)
        db.flush()

        # ─────────────── staff users ─────────────────────── #
        admin = User(
            name="Admin User", email="admin@coaching.in",
            password_hash=hash_password("admin123"),
            role="admin", centre_id=None, is_active=True,
        )
        accounts = User(
            name="Accounts Staff", email="accounts@coaching.in",
            password_hash=hash_password("accounts123"),
            role="accounts", centre_id=centres[0].id, is_active=True,
        )
        counsellor = User(
            name="Counsellor Staff", email="counsellor@coaching.in",
            password_hash=hash_password("counsellor123"),
            role="counsellor", centre_id=centres[0].id, is_active=True,
        )
        db.add_all([admin, accounts, counsellor])
        db.flush()

        # ─────────────── batches (2 per centre) ─────────── #
        batches = []
        course_start = TODAY - timedelta(days=60)
        course_end = course_start + timedelta(days=365)
        first_due = TODAY - timedelta(days=23)

        for centre in centres:
            for course, shift in [("JEE", "Morning"), ("NEET", "Evening")]:
                b = Batch(
                    centre_id=centre.id,
                    name=f"{course} 2027 {shift}",
                    course=course,
                    course_start=course_start,
                    course_end=course_end,
                    total_fee_paise=12000000,  # ₹1,20,000
                    registration_fee_paise=500000,  # ₹5,000
                    instalment_count=4,
                    first_due_date=first_due,
                    gap_months=3,
                )
                db.add(b)
                batches.append(b)
        db.flush()

        # ─────────────── guardians + students ────────────── #
        phone_counter = 9000000000
        all_students = []

        # 3 named demo students
        demo_specs = [
            {
                "name": "Aarav Meena", "guardian": "Ramesh Meena",
                "batch_idx": 0, "pay_full_first": True,
            },
            {
                "name": "Ishita Sharma", "guardian": "Rakesh Sharma",
                "batch_idx": 1, "pay_half_first": True,
            },
            {
                "name": "Mohit Gurjar", "guardian": "Suresh Gurjar",
                "batch_idx": 2, "pay_nothing": True,
            },
        ]

        for spec in demo_specs:
            phone_counter += 1
            phone = f"+91{phone_counter}"
            guardian = Guardian(
                name=spec["guardian"], phone=phone, language="hi",
                consent_version="2026-11",
                consented_at=datetime.now(timezone.utc) - timedelta(days=30),
            )
            db.add(guardian)
            db.flush()

            batch = batches[spec["batch_idx"]]
            net = batch.total_fee_paise  # no discount
            student = Student(
                student_code=_next_student_code(),
                full_name=spec["name"],
                batch_id=batch.id,
                guardian_id=guardian.id,
                status="active",
                enrolled_on=course_start,
                gross_fee_paise=batch.total_fee_paise,
                discount_paise=0,
                net_fee_paise=net,
                registration_fee_paise=batch.registration_fee_paise,
            )
            db.add(student)
            db.flush()

            # create instalments
            inst_dicts = build_instalments(net, batch.instalment_count, batch.first_due_date, batch.gap_months)
            inst_objects = []
            for d in inst_dicts:
                inst = Instalment(student_id=student.id, seq=d["seq"], due_date=d["due_date"], amount_paise=d["amount_paise"])
                db.add(inst)
                inst_objects.append(inst)
            db.flush()

            inst_data = [{"id": i.id, "balance": i.amount_paise} for i in inst_objects]

            if spec.get("pay_full_first"):
                _make_payment_and_allocate(db, student, inst_dicts[0]["amount_paise"], "cash", accounts.id, inst_data)
            elif spec.get("pay_half_first"):
                _make_payment_and_allocate(db, student, inst_dicts[0]["amount_paise"] // 2, "cash", accounts.id, inst_data)

            all_students.append(student)

        # ~130 more random students
        for i in range(127):
            phone_counter += 1
            phone = f"+91{phone_counter}"
            g_name = _random_name()
            guardian = Guardian(
                name=g_name, phone=phone,
                language=random.choice(["en", "hi"]),
                consent_version="2026-11" if random.random() > 0.1 else None,
                consented_at=datetime.now(timezone.utc) - timedelta(days=random.randint(1, 60)) if random.random() > 0.1 else None,
            )
            db.add(guardian)
            db.flush()

            batch = random.choice(batches)
            discount = random.choice([0, 0, 0, 500000, 1000000])
            net = batch.total_fee_paise - discount
            student = Student(
                student_code=_next_student_code(),
                full_name=_random_name(),
                batch_id=batch.id,
                guardian_id=guardian.id,
                status="active" if i != 126 else "left",
                enrolled_on=course_start,
                left_on=TODAY - timedelta(days=10) if i == 126 else None,
                gross_fee_paise=batch.total_fee_paise,
                discount_paise=discount,
                discount_reason="Merit scholarship" if discount > 0 else None,
                net_fee_paise=net,
                registration_fee_paise=batch.registration_fee_paise,
            )
            db.add(student)
            db.flush()

            inst_dicts = build_instalments(net, batch.instalment_count, batch.first_due_date, batch.gap_months)
            inst_objects = []
            for d in inst_dicts:
                inst = Instalment(student_id=student.id, seq=d["seq"], due_date=d["due_date"], amount_paise=d["amount_paise"])
                db.add(inst)
                inst_objects.append(inst)
            db.flush()

            inst_data = [{"id": io.id, "balance": io.amount_paise} for io in inst_objects]

            # vary payment patterns
            r = random.random()
            if r < 0.25:
                # fully paid first instalment
                _make_payment_and_allocate(db, student, inst_dicts[0]["amount_paise"], "cash", accounts.id, inst_data)
            elif r < 0.40:
                # part paid
                _make_payment_and_allocate(db, student, inst_dicts[0]["amount_paise"] // 2, "bank_transfer", accounts.id, inst_data)
            elif r < 0.50:
                # paid two instalments
                total_two = inst_dicts[0]["amount_paise"] + inst_dicts[1]["amount_paise"]
                _make_payment_and_allocate(db, student, total_two, "cash", accounts.id, inst_data)
            # else: no payment (overdue or upcoming)

            all_students.append(student)

        # ─────── 1 unmatched bank transfer ─────── #
        unmatched = Payment(
            student_id=None,
            amount_paise=2500000,
            method="bank_transfer",
            reference=f"UTR{random.randint(100000, 999999)}",
            status="succeeded",
            recorded_by=accounts.id,
        )
        db.add(unmatched)
        db.flush()

        # ─────── attendance records (8 weeks) ──── #
        for student in all_students:
            if student.status != "active":
                continue
            for week_offset in range(8):
                for day_in_week in range(6):  # Mon-Sat
                    d = TODAY - timedelta(weeks=8 - week_offset, days=-day_in_week)
                    if d > TODAY:
                        continue
                    # recent weeks: lower attendance for some (risk triggers)
                    if student.id % 20 < 5 and week_offset >= 4:
                        present = random.random() > 0.5  # ~50% attendance
                    else:
                        present = random.random() > 0.15  # ~85% attendance
                    db.add(AttendanceRecord(student_id=student.id, date=d, present=present))

        db.flush()

        # ─────── test scores (5 tests) ──────── #
        for student in all_students:
            if student.status != "active":
                continue
            for t in range(5):
                test_date = TODAY - timedelta(weeks=10 - t * 2)
                max_score = 100
                # declining scores for some students (risk triggers)
                if student.id % 15 < 3:
                    score = max(10, 80 - t * 12 + random.randint(-5, 5))
                else:
                    score = random.randint(40, 95)
                db.add(TestScore(
                    student_id=student.id,
                    test_name=f"Test-{t + 1}",
                    test_date=test_date,
                    score=min(score, max_score),
                    max_score=max_score,
                ))

        db.flush()
        db.commit()
        print(f"[OK] Seeded {len(all_students)} students across {len(centres)} centres.")
        print(f"  Demo logins:")
        print(f"    admin@coaching.in / admin123")
        print(f"    accounts@coaching.in / accounts123")
        print(f"    counsellor@coaching.in / counsellor123")
        print(f"  Parent test phones: +919000000001, +919000000002, +919000000003")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()

