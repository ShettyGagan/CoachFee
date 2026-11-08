"""Academics service: bulk upload of attendance and test scores (CSV / Excel),
querying batch academics, and student academics for parent / staff portal.
"""
from __future__ import annotations

import base64
import csv
import io
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime
from typing import Any

from sqlalchemy import desc, distinct, func, select
from sqlalchemy.orm import Session

from app.exceptions import Invalid, NotFound
from app.models import AttendanceRecord, Batch, Student, TestScore


def _normalize_key(key: str) -> str:
    """Normalize column header: 'Student Code' -> 'student_code'."""
    k = key.strip().lower()
    return re.sub(r"[\s\-_]+", "_", k)


def _parse_date(val: Any) -> date | None:
    """Parse various date representations into datetime.date."""
    if not val:
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, datetime):
        return val.date()

    val_str = str(val).strip()
    # Try ISO YYYY-MM-DD
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            pass
    return None


def _parse_xlsx(file_bytes: bytes) -> list[dict[str, str]]:
    """Parse .xlsx bytes using standard library zipfile and XML parser."""
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
        # 1. Read shared strings
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
            ns = {"ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in tree.findall(".//ns:si", ns):
                t_el = si.find(".//ns:t", ns)
                shared_strings.append(t_el.text if t_el is not None and t_el.text else "")

        # 2. Read sheet1
        sheet_path = "xl/worksheets/sheet1.xml"
        if sheet_path not in z.namelist():
            # Try finding any sheet
            for name in z.namelist():
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                    sheet_path = name
                    break

        sheet_xml = z.read(sheet_path)
        tree = ET.fromstring(sheet_xml)
        ns = {"ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

        raw_rows: list[list[str]] = []
        for row_el in tree.findall(".//ns:row", ns):
            row_vals: list[str] = []
            for c in row_el.findall("ns:c", ns):
                t = c.get("t")
                v = c.find("ns:v", ns)
                val = v.text if v is not None and v.text else ""
                if t == "s" and val.isdigit():
                    idx = int(val)
                    val = shared_strings[idx] if idx < len(shared_strings) else val
                row_vals.append(val.strip())
            if any(row_vals):
                raw_rows.append(row_vals)

        if len(raw_rows) < 2:
            return []

        headers = [_normalize_key(h) for h in raw_rows[0]]
        dict_rows: list[dict[str, str]] = []
        for r in raw_rows[1:]:
            row_dict: dict[str, str] = {}
            for idx, h in enumerate(headers):
                row_dict[h] = r[idx] if idx < len(r) else ""
            if any(row_dict.values()):
                dict_rows.append(row_dict)
        return dict_rows


def _parse_csv(text_content: str) -> list[dict[str, str]]:
    """Parse CSV text content."""
    reader = csv.reader(io.StringIO(text_content.strip()))
    raw_rows = list(reader)
    if len(raw_rows) < 2:
        return []
    headers = [_normalize_key(h) for h in raw_rows[0]]
    dict_rows: list[dict[str, str]] = []
    for r in raw_rows[1:]:
        row_dict: dict[str, str] = {}
        for idx, h in enumerate(headers):
            row_dict[h] = r[idx].strip() if idx < len(r) else ""
        if any(row_dict.values()):
            dict_rows.append(row_dict)
    return dict_rows


def parse_file_to_rows(filename: str, file_data: str) -> list[dict[str, str]]:
    """Parse CSV or Excel file given base64 or raw text data."""
    # Check if file_data is base64 encoded
    data_bytes: bytes | None = None
    if file_data.startswith("data:") and ";base64," in file_data:
        b64 = file_data.split(";base64,")[1]
        data_bytes = base64.b64decode(b64)
    else:
        try:
            data_bytes = base64.b64decode(file_data)
        except Exception:
            data_bytes = file_data.encode("utf-8")

    # Check for xlsx PK zip magic bytes or filename
    is_xlsx = (
        filename.lower().endswith(".xlsx")
        or (data_bytes and data_bytes[:4] == b"PK\x03\x04")
    )

    if is_xlsx:
        return _parse_xlsx(data_bytes)

    # Fallback to CSV decoding
    try:
        text_content = data_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_content = data_bytes.decode("latin-1")

    return _parse_csv(text_content)


def bulk_upload_attendance(
    db: Session,
    batch_id: int,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Bulk upsert attendance records for students in a batch."""
    batch = db.get(Batch, batch_id)
    if not batch:
        raise NotFound("BATCH_NOT_FOUND", "Batch not found.")

    # Map student_code to Student: prioritize target batch, fallback to global student directory
    batch_students = db.execute(
        select(Student).where(Student.batch_id == batch_id)
    ).scalars().all()
    code_map = {s.student_code.strip().upper(): s for s in batch_students}

    all_students = db.execute(select(Student)).scalars().all()
    global_code_map = {s.student_code.strip().upper(): s for s in all_students}

    inserted = 0
    updated = 0
    errors: list[str] = []

    for idx, row in enumerate(rows, start=1):
        code = str(row.get("student_code") or row.get("code") or "").strip().upper()
        if not code:
            errors.append(f"Row {idx}: Missing student_code.")
            continue

        student = code_map.get(code) or global_code_map.get(code)
        if not student:
            errors.append(f"Row {idx}: Student code '{code}' not found in system.")
            continue

        raw_date = row.get("date") or row.get("attendance_date")
        parsed_date = _parse_date(raw_date)
        if not parsed_date:
            errors.append(f"Row {idx}: Invalid date '{raw_date}' for student {code}.")
            continue

        # Status / Present
        status_val = str(row.get("status") or row.get("present") or "present").strip().lower()
        is_present = status_val in ("present", "p", "1", "true", "yes")

        # Check existing
        existing = db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.student_id == student.id,
                AttendanceRecord.date == parsed_date,
            )
        ).scalar_one_or_none()

        if existing:
            existing.present = is_present
            updated += 1
        else:
            db.add(AttendanceRecord(
                student_id=student.id,
                date=parsed_date,
                present=is_present,
            ))
            inserted += 1

    db.commit()
    return {
        "success": True,
        "total_rows": len(rows),
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
    }


def bulk_upload_test_scores(
    db: Session,
    batch_id: int,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Bulk upsert test scores for students in a batch."""
    batch = db.get(Batch, batch_id)
    if not batch:
        raise NotFound("BATCH_NOT_FOUND", "Batch not found.")

    batch_students = db.execute(
        select(Student).where(Student.batch_id == batch_id)
    ).scalars().all()
    code_map = {s.student_code.strip().upper(): s for s in batch_students}

    all_students = db.execute(select(Student)).scalars().all()
    global_code_map = {s.student_code.strip().upper(): s for s in all_students}

    inserted = 0
    updated = 0
    errors: list[str] = []

    for idx, row in enumerate(rows, start=1):
        code = str(row.get("student_code") or row.get("code") or "").strip().upper()
        if not code:
            errors.append(f"Row {idx}: Missing student_code.")
            continue

        student = code_map.get(code) or global_code_map.get(code)
        if not student:
            errors.append(f"Row {idx}: Student code '{code}' not found in system.")
            continue

        test_name = str(row.get("test_name") or row.get("test") or "").strip()
        if not test_name:
            errors.append(f"Row {idx}: Missing test_name for student {code}.")
            continue

        raw_date = row.get("test_date") or row.get("date")
        parsed_date = _parse_date(raw_date) or date.today()

        try:
            score = int(float(row.get("score", 0)))
            max_score = int(float(row.get("max_score", 100)))
        except (ValueError, TypeError):
            errors.append(f"Row {idx}: Invalid score/max_score for student {code}.")
            continue

        if max_score <= 0 or score < 0 or score > max_score:
            errors.append(f"Row {idx}: Score {score}/{max_score} out of valid range (0 <= score <= max_score).")
            continue

        existing = db.execute(
            select(TestScore).where(
                TestScore.student_id == student.id,
                TestScore.test_name == test_name,
            )
        ).scalar_one_or_none()

        if existing:
            existing.score = score
            existing.max_score = max_score
            existing.test_date = parsed_date
            updated += 1
        else:
            db.add(TestScore(
                student_id=student.id,
                test_name=test_name,
                test_date=parsed_date,
                score=score,
                max_score=max_score,
            ))
            inserted += 1

    db.commit()
    return {
        "success": True,
        "total_rows": len(rows),
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
    }


def get_batch_attendance(
    db: Session,
    batch_id: int,
    date_val: date | None = None,
) -> list[dict[str, Any]]:
    """List attendance records for a batch."""
    q = (
        select(AttendanceRecord, Student)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .where(Student.batch_id == batch_id)
    )
    if date_val:
        q = q.where(AttendanceRecord.date == date_val)
    q = q.order_by(desc(AttendanceRecord.date), Student.full_name)

    results = db.execute(q).all()
    return [
        {
            "id": att.id,
            "student_id": stu.id,
            "student_name": stu.full_name,
            "student_code": stu.student_code,
            "date": att.date.isoformat(),
            "present": att.present,
        }
        for att, stu in results
    ]


def get_batch_attendance_meta(db: Session, batch_id: int) -> list[str]:
    """Get all distinct dates that have attendance for a batch (descending)."""
    dates = db.execute(
        select(distinct(AttendanceRecord.date))
        .join(Student, Student.id == AttendanceRecord.student_id)
        .where(Student.batch_id == batch_id)
        .order_by(desc(AttendanceRecord.date))
    ).scalars().all()
    return [d.isoformat() for d in dates]


def get_batch_test_scores(
    db: Session,
    batch_id: int,
    test_name: str | None = None,
) -> list[dict[str, Any]]:
    """List test scores for a batch."""
    q = (
        select(TestScore, Student)
        .join(Student, Student.id == TestScore.student_id)
        .where(Student.batch_id == batch_id)
    )
    if test_name:
        q = q.where(TestScore.test_name == test_name)
    q = q.order_by(desc(TestScore.test_date), Student.full_name)

    results = db.execute(q).all()
    return [
        {
            "id": ts.id,
            "student_id": stu.id,
            "student_name": stu.full_name,
            "student_code": stu.student_code,
            "test_name": ts.test_name,
            "test_date": ts.test_date.isoformat(),
            "score": ts.score,
            "max_score": ts.max_score,
            "percentage": round((ts.score / ts.max_score) * 100, 1) if ts.max_score > 0 else 0,
        }
        for ts, stu in results
    ]


def get_batch_test_names(db: Session, batch_id: int) -> list[dict[str, Any]]:
    """Get all distinct tests recorded for a batch."""
    rows = db.execute(
        select(
            TestScore.test_name,
            func.max(TestScore.test_date).label("test_date"),
            func.max(TestScore.max_score).label("max_score"),
            func.count(TestScore.id).label("student_count"),
        )
        .join(Student, Student.id == TestScore.student_id)
        .where(Student.batch_id == batch_id)
        .group_by(TestScore.test_name)
        .order_by(desc(func.max(TestScore.test_date)))
    ).all()
    return [
        {
            "test_name": r.test_name,
            "test_date": r.test_date.isoformat() if r.test_date else "",
            "max_score": r.max_score or 100,
            "student_count": r.student_count,
        }
        for r in rows
    ]


def get_student_academics(db: Session, student_id: int) -> dict[str, Any]:
    """Retrieve full attendance stats and test scores for a student."""
    student = db.get(Student, student_id)
    if not student:
        raise NotFound("STUDENT_NOT_FOUND", "Student not found.")

    # Attendance
    att_records = db.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.student_id == student_id)
        .order_by(desc(AttendanceRecord.date))
    ).scalars().all()

    total_days = len(att_records)
    present_days = sum(1 for a in att_records if a.present)
    absent_days = total_days - present_days
    attendance_pct = round((present_days / total_days) * 100, 1) if total_days > 0 else 100.0

    # Tests
    test_records = db.execute(
        select(TestScore)
        .where(TestScore.student_id == student_id)
        .order_by(desc(TestScore.test_date))
    ).scalars().all()

    avg_score_pct = (
        round(sum((t.score / t.max_score) * 100 for t in test_records) / len(test_records), 1)
        if test_records
        else 0.0
    )

    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "student_code": student.student_code,
        "attendance": {
            "total_days": total_days,
            "present_days": present_days,
            "absent_days": absent_days,
            "percentage": attendance_pct,
            "records": [
                {
                    "id": a.id,
                    "date": a.date.isoformat(),
                    "present": a.present,
                }
                for a in att_records
            ],
        },
        "tests": {
            "total_tests": len(test_records),
            "average_percentage": avg_score_pct,
            "records": [
                {
                    "id": t.id,
                    "test_name": t.test_name,
                    "test_date": t.test_date.isoformat(),
                    "score": t.score,
                    "max_score": t.max_score,
                    "percentage": round((t.score / t.max_score) * 100, 1) if t.max_score > 0 else 0,
                }
                for t in test_records
            ],
        },
    }

