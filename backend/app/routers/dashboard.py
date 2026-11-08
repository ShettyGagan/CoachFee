"""Dashboard routes: summary, dues breakdown, ageing."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.schemas import AgeingResponse, DashboardSummary
from app.security import require_staff
from app.services import dashboard as dash_svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary(
    centre_id: int | None = Query(None),
    period: str = Query("this_month", pattern="^(this_month|last_month|this_quarter|all_time)$"),
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Financial summary cards (cached for 60s)."""
    user_centre = principal.get("centre_id") or centre_id
    cache_key = f"dashboard:summary:{user_centre or 'all'}:{period}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return DashboardSummary(**cached_val)

    data = dash_svc.get_summary(db, centre_id=user_centre, period=period)
    cache.set(cache_key, data, ttl=60)
    return DashboardSummary(**data)


@router.get("/dues")
def get_dues(
    group_by: str = Query("centre", pattern="^(centre|batch)$"),
    centre_id: int | None = Query(None),
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Dues grouped by centre or batch (cached for 60s)."""
    user_centre = principal.get("centre_id") or centre_id
    cache_key = f"dashboard:dues:{user_centre or 'all'}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    centre_items = dash_svc.get_dues_breakdown(db, group_by="centre", centre_id=user_centre)
    batch_items = dash_svc.get_dues_breakdown(db, group_by="batch", centre_id=user_centre)

    def _fmt(items: list[dict], is_batch: bool = False) -> list[dict]:
        res = []
        for i in items:
            label = i["name"]
            if is_batch and i.get("centre_name") and not user_centre:
                label = f"{i['name']} · {i['centre_name']}"
            res.append({
                "id": i["id"],
                "label": label,
                "outstanding_paise": i["outstanding_paise"],
                "overdue_paise": i["overdue_paise"],
            })
        return res

    result = {
        "by_centre": _fmt(centre_items, is_batch=False),
        "by_batch": _fmt(batch_items, is_batch=True),
    }
    cache.set(cache_key, result, ttl=60)
    return result


@router.get("/ageing")
def get_ageing(
    centre_id: int | None = Query(None),
    batch_id: int | None = Query(None),
    principal: dict = Depends(require_staff("accounts", "admin")),
    db: Session = Depends(get_db),
):
    """Ageing buckets for open instalments (cached for 60s)."""
    user_centre = principal.get("centre_id") or centre_id
    cache_key = f"dashboard:ageing:{user_centre or 'all'}:{batch_id or 'all'}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    raw = dash_svc.get_ageing(db, centre_id=user_centre, batch_id=batch_id)

    buckets = [
        {
            "bucket": b["bucket"],
            "count": b["students"],
            "paise": b["amount_paise"],
        }
        for b in raw["buckets"]
    ]
    result = {"buckets": buckets}
    cache.set(cache_key, result, ttl=60)
    return result
