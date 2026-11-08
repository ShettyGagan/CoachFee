"""Academics routes: bulk uploads, batch academic records, sample templates."""
from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.exceptions import Invalid, NotFound
from app.models import Batch, Student
from app.security import require_staff
from app.services import academics as acad_svc

router = APIRouter(prefix="/academics", tags=["academics"])


class BulkUploadPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    batch_id: int
    filename: str = "upload.csv"
    file_data: str | None = None
    rows: list[dict[str, Any]] | None = None


class PreviewPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    filename: str
    file_data: str


@router.post("/parse-preview")
def preview_file(
    payload: PreviewPayload,
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
):
    """Parse CSV or Excel file and return rows for preview before upload."""
    if not payload.file_data:
        raise Invalid("EMPTY_FILE", "File data is empty.")
    try:
        rows = acad_svc.parse_file_to_rows(payload.filename, payload.file_data)
        return {
            "total": len(rows),
            "headers": list(rows[0].keys()) if rows else [],
            "preview_rows": rows[:50],
        }
    except Exception as exc:
        raise Invalid("PARSE_ERROR", f"Failed to parse file: {str(exc)}")


@router.post("/attendance/bulk")
def upload_attendance(
    payload: BulkUploadPayload,
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
    db: Session = Depends(get_db),
):
    """Bulk upload attendance for a batch via CSV, Excel, or JSON rows."""
    rows = payload.rows
    if not rows and payload.file_data:
        rows = acad_svc.parse_file_to_rows(payload.filename, payload.file_data)

    if not rows:
        raise Invalid("NO_ROWS", "No data rows found in upload.")

    result = acad_svc.bulk_upload_attendance(db, payload.batch_id, rows)
    cache.delete_pattern("academics:*")
    return result


@router.post("/test-scores/bulk")
def upload_test_scores(
    payload: BulkUploadPayload,
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
    db: Session = Depends(get_db),
):
    """Bulk upload test scores for a batch via CSV, Excel, or JSON rows."""
    rows = payload.rows
    if not rows and payload.file_data:
        rows = acad_svc.parse_file_to_rows(payload.filename, payload.file_data)

    if not rows:
        raise Invalid("NO_ROWS", "No data rows found in upload.")

    result = acad_svc.bulk_upload_test_scores(db, payload.batch_id, rows)
    cache.delete_pattern("academics:*")
    return result


@router.get("/batch/{batch_id}/attendance")
def get_batch_attendance(
    batch_id: int,
    attendance_date: date | None = Query(None),
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
    db: Session = Depends(get_db),
):
    """List attendance records for a batch, optionally on a specific date (cached for 60s)."""
    date_str = attendance_date.isoformat() if attendance_date else "all"
    cache_key = f"academics:batch:{batch_id}:att:{date_str}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    records = acad_svc.get_batch_attendance(db, batch_id, attendance_date)
    available_dates = acad_svc.get_batch_attendance_meta(db, batch_id)
    res = {"records": records, "available_dates": available_dates}
    cache.set(cache_key, res, ttl=60)
    return res


@router.get("/batch/{batch_id}/test-scores")
def get_batch_test_scores(
    batch_id: int,
    test_name: str | None = Query(None),
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
    db: Session = Depends(get_db),
):
    """List test scores for a batch, optionally for a specific test (cached for 60s)."""
    test_str = test_name or "all"
    cache_key = f"academics:batch:{batch_id}:tests:{test_str}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    records = acad_svc.get_batch_test_scores(db, batch_id, test_name)
    available_tests = acad_svc.get_batch_test_names(db, batch_id)
    res = {"records": records, "available_tests": available_tests}
    cache.set(cache_key, res, ttl=60)
    return res


@router.get("/student/{student_id}")
def get_student_academics(
    student_id: int,
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
    db: Session = Depends(get_db),
):
    """Get full academic report (attendance + tests) for an individual student (cached for 60s)."""
    cache_key = f"academics:student:{student_id}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    res = acad_svc.get_student_academics(db, student_id)
    cache.set(cache_key, res, ttl=60)
    return res


@router.get("/template/{kind}")
def download_template(
    kind: str,
    batch_id: int | None = Query(None),
    principal: dict = Depends(require_staff("admin", "accounts", "counsellor")),
    db: Session = Depends(get_db),
):
    """Download ready-to-use CSV template, pre-populated with student codes if batch_id provided."""
    students: list[Student] = []
    if batch_id:
        students = db.execute(
            select(Student).where(Student.batch_id == batch_id).order_by(Student.student_code)
        ).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)

    today_str = date.today().isoformat()

    if kind == "attendance":
        writer.writerow(["student_code", "student_name", "date", "status"])
        if students:
            for s in students:
                writer.writerow([s.student_code, s.full_name, today_str, "present"])
        else:
            writer.writerow(["STU-0001", "Aarav Sharma", today_str, "present"])
            writer.writerow(["STU-0002", "Ishita Meena", today_str, "absent"])
        filename = f"attendance_template_{batch_id or 'sample'}.csv"
    else:
        writer.writerow(["student_code", "student_name", "test_name", "test_date", "score", "max_score"])
        if students:
            for s in students:
                writer.writerow([s.student_code, s.full_name, "Unit Test 1", today_str, "85", "100"])
        else:
            writer.writerow(["STU-0001", "Aarav Sharma", "Unit Test 1", today_str, "85", "100"])
            writer.writerow(["STU-0002", "Ishita Meena", "Unit Test 1", today_str, "92", "100"])
        filename = f"test_scores_template_{batch_id or 'sample'}.csv"

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

