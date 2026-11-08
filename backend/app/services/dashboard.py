"""Dashboard service: summary, dues breakdown, ageing buckets.

All figures come from the ``instalment_status`` view; nothing is stored.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session


def _india_today() -> date:
    """Current date in Asia/Kolkata."""
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _get_period_bounds(period: str | None) -> tuple[datetime | None, datetime | None, date | None, date | None]:
    """Returns (dt_start, dt_end, date_start, date_end) for the given period in Asia/Kolkata timezone."""
    if not period or period == "all_time":
        return None, None, None, None

    today = _india_today()
    kolkata = ZoneInfo("Asia/Kolkata")

    if period == "this_month":
        date_start = today.replace(day=1)
        if today.month == 12:
            date_end = today.replace(year=today.year + 1, month=1, day=1)
        else:
            date_end = today.replace(month=today.month + 1, day=1)

    elif period == "last_month":
        if today.month == 1:
            date_start = today.replace(year=today.year - 1, month=12, day=1)
            date_end = today.replace(month=1, day=1)
        else:
            date_start = today.replace(month=today.month - 1, day=1)
            date_end = today.replace(month=today.month, day=1)

    elif period == "this_quarter":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        date_start = today.replace(month=q_start_month, day=1)
        if q_start_month + 3 > 12:
            date_end = today.replace(year=today.year + 1, month=1, day=1)
        else:
            date_end = today.replace(month=q_start_month + 3, day=1)
    else:
        return None, None, None, None

    dt_start = datetime(date_start.year, date_start.month, date_start.day, 0, 0, 0, tzinfo=kolkata)
    dt_end = datetime(date_end.year, date_end.month, date_end.day, 0, 0, 0, tzinfo=kolkata)
    return dt_start, dt_end, date_start, date_end


def get_summary(
    db: Session,
    centre_id: int | None = None,
    period: str | None = None,
) -> dict:
    """Financial summary (active students only), filterable by centre and period."""
    centre_filter = ""
    params: dict = {}
    if centre_id is not None:
        centre_filter = "AND b.centre_id = :centre_id"
        params["centre_id"] = centre_id

    dt_start, dt_end, date_start, date_end = _get_period_bounds(period)

    date_filter = ""
    if date_start is not None and date_end is not None:
        date_filter = "AND ist.due_date >= :date_start AND ist.due_date < :date_end"
        params["date_start"] = date_start
        params["date_end"] = date_end

    # Query instalment status metrics
    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(ist.amount_paise), 0)::bigint AS billed_paise,
            COALESCE(SUM(ist.paid_paise), 0)::bigint AS paid_on_instalments,
            COALESCE(SUM(ist.balance_paise), 0)::bigint AS outstanding_paise,
            COALESCE(SUM(CASE WHEN ist.days_overdue > 0 THEN ist.balance_paise ELSE 0 END), 0)::bigint AS overdue_paise
        FROM instalment_status ist
        JOIN students s ON s.id = ist.student_id
        JOIN batches b ON b.id = s.batch_id
        WHERE s.status = 'active' {centre_filter} {date_filter}
    """), params).first()

    # Query collections received in this period
    coll_params: dict = {}
    coll_centre_filter = ""
    if centre_id is not None:
        coll_centre_filter = "AND b.centre_id = :coll_centre_id"
        coll_params["coll_centre_id"] = centre_id

    coll_date_filter = ""
    if dt_start is not None and dt_end is not None:
        coll_date_filter = "AND p.received_at >= :dt_start AND p.received_at < :dt_end"
        coll_params["dt_start"] = dt_start
        coll_params["dt_end"] = dt_end

    collected_row = db.execute(text(f"""
        SELECT COALESCE(SUM(p.amount_paise), 0)::bigint AS collected_paise
        FROM payments p
        JOIN students s ON s.id = p.student_id
        JOIN batches b ON b.id = s.batch_id
        WHERE s.status = 'active' AND p.status = 'succeeded'
          {coll_centre_filter} {coll_date_filter}
    """), coll_params).first()

    collected_paise = collected_row.collected_paise if collected_row else (row.paid_on_instalments if row else 0)
    # Fallback to paid_on_instalments if all_time or if payments query is 0
    if not dt_start and row and row.paid_on_instalments > collected_paise:
        collected_paise = row.paid_on_instalments

    # Unmatched payments in period
    unmatched_params: dict = {}
    unmatched_centre_filter = ""
    if centre_id is not None:
        unmatched_centre_filter = "AND b.centre_id = :um_centre_id"
        unmatched_params["um_centre_id"] = centre_id

    unmatched_date_filter = ""
    if dt_start is not None and dt_end is not None:
        unmatched_date_filter = "AND um.received_at >= :um_dt_start AND um.received_at < :um_dt_end"
        unmatched_params["um_dt_start"] = dt_start
        unmatched_params["um_dt_end"] = dt_end

    unmatched = db.execute(text(f"""
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(um.unallocated_paise), 0)::bigint AS total_paise
        FROM unmatched_payments um
        LEFT JOIN students s ON s.id = um.student_id
        LEFT JOIN batches b ON b.id = s.batch_id
        WHERE 1=1 {unmatched_centre_filter} {unmatched_date_filter}
    """), unmatched_params).first()

    return {
        "billed_paise": row.billed_paise if row else 0,
        "collected_paise": collected_paise,
        "outstanding_paise": row.outstanding_paise if row else 0,
        "overdue_paise": row.overdue_paise if row else 0,
        "unmatched_count": unmatched.cnt if unmatched else 0,
        "unmatched_paise": unmatched.total_paise if unmatched else 0,
    }


def get_dues_breakdown(
    db: Session,
    group_by: str = "centre",
    centre_id: int | None = None,
) -> list[dict]:
    """Dues grouped by centre or batch, sorted by overdue descending."""
    centre_filter = ""
    params: dict = {}
    if centre_id is not None:
        centre_filter = "AND b.centre_id = :centre_id"
        params["centre_id"] = centre_id

    if group_by == "centre":
        query = f"""
            SELECT c.id, c.name,
                   COUNT(DISTINCT s.id) AS students,
                   COALESCE(SUM(ist.balance_paise), 0)::bigint AS outstanding_paise,
                   COALESCE(SUM(CASE WHEN ist.days_overdue > 0 THEN ist.balance_paise ELSE 0 END), 0)::bigint AS overdue_paise
            FROM instalment_status ist
            JOIN students s ON s.id = ist.student_id
            JOIN batches b ON b.id = s.batch_id
            JOIN centres c ON c.id = b.centre_id
            WHERE s.status = 'active' {centre_filter}
            GROUP BY c.id, c.name
            ORDER BY overdue_paise DESC
        """
    else:
        query = f"""
            SELECT b.id, b.name, c.name AS centre_name,
                   COUNT(DISTINCT s.id) AS students,
                   COALESCE(SUM(ist.balance_paise), 0)::bigint AS outstanding_paise,
                   COALESCE(SUM(CASE WHEN ist.days_overdue > 0 THEN ist.balance_paise ELSE 0 END), 0)::bigint AS overdue_paise
            FROM instalment_status ist
            JOIN students s ON s.id = ist.student_id
            JOIN batches b ON b.id = s.batch_id
            JOIN centres c ON c.id = b.centre_id
            WHERE s.status = 'active' {centre_filter}
            GROUP BY b.id, b.name, c.name
            ORDER BY overdue_paise DESC
        """

    rows = db.execute(text(query), params).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "centre_name": r._mapping.get("centre_name"),
            "students": r.students,
            "outstanding_paise": r.outstanding_paise,
            "overdue_paise": r.overdue_paise,
        }
        for r in rows
    ]


def get_ageing(
    db: Session,
    centre_id: int | None = None,
    batch_id: int | None = None,
) -> dict:
    """Ageing buckets for open instalments."""
    conditions = ["s.status = 'active'", "ist.balance_paise > 0"]
    params: dict = {}
    if centre_id is not None:
        conditions.append("b.centre_id = :centre_id")
        params["centre_id"] = centre_id
    if batch_id is not None:
        conditions.append("b.id = :batch_id")
        params["batch_id"] = batch_id

    where = " AND ".join(conditions)

    rows = db.execute(text(f"""
        SELECT
            CASE
                WHEN ist.days_overdue <= 0 THEN 'not_yet_due'
                WHEN ist.days_overdue <= 30 THEN '1-30'
                WHEN ist.days_overdue <= 60 THEN '31-60'
                ELSE 'over_60'
            END AS bucket,
            COALESCE(SUM(ist.balance_paise), 0)::bigint AS amount_paise,
            COUNT(DISTINCT s.id) AS students
        FROM instalment_status ist
        JOIN students s ON s.id = ist.student_id
        JOIN batches b ON b.id = s.batch_id
        WHERE {where}
        GROUP BY 1
    """), params).all()

    # ensure all buckets exist
    bucket_map = {r.bucket: {"bucket": r.bucket, "amount_paise": r.amount_paise, "students": r.students} for r in rows}
    all_buckets = ["not_yet_due", "1-30", "31-60", "over_60"]
    buckets = [
        bucket_map.get(b, {"bucket": b, "amount_paise": 0, "students": 0})
        for b in all_buckets
    ]

    return {"buckets": buckets}

