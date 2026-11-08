"""Setup routes: centres and batches (admin)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cache import cache
from app.db import get_db
from app.exceptions import Conflict, NotFound
from app.models import Batch, Centre
from app.schemas import BatchCreate, BatchOut, CentreCreate, CentreOut, PaginatedResponse
from app.security import check_centre_scope, current_principal, require_staff

router = APIRouter(tags=["setup"])


# ───────────────────────── centres ──────────────────────────────── #

@router.get("/centres")
def list_centres(
    principal: dict = Depends(require_staff()),
    db: Session = Depends(get_db),
):
    """List centres (scoped to user's centre, cached for 5 minutes)."""
    user_centre = principal.get("centre_id")
    cache_key = f"setup:centres:{user_centre or 'all'}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    q = select(Centre)
    if user_centre is not None:
        q = q.where(Centre.id == user_centre)
    rows = db.execute(q.order_by(Centre.name)).scalars().all()
    items = [CentreOut(id=c.id, name=c.name, city=c.city).model_dump() for c in rows]
    result = {"items": items, "total": len(items)}
    cache.set(cache_key, result, ttl=300)
    return result
    return PaginatedResponse(items=items, total=len(items))


@router.post("/centres", status_code=201)
def create_centre(
    body: CentreCreate,
    _: dict = Depends(require_staff("admin")),
    db: Session = Depends(get_db),
):
    """Create a new centre (admin only)."""
    existing = db.execute(select(Centre).where(Centre.name == body.name)).scalar_one_or_none()
    if existing:
        raise Conflict("CONFLICT", "A centre with this name already exists.")
    centre = Centre(name=body.name, city=body.city)
    db.add(centre)
    db.flush()
    cache.delete_pattern("setup:*")
    cache.delete_pattern("dashboard:*")
    return CentreOut(id=centre.id, name=centre.name, city=centre.city)


# ───────────────────────── batches ──────────────────────────────── #

@router.get("/batches")
def list_batches(
    centre_id: int | None = Query(None),
    principal: dict = Depends(require_staff()),
    db: Session = Depends(get_db),
):
    """List batches, optionally filtered by centre (cached for 5 minutes)."""
    user_centre = principal.get("centre_id") or centre_id
    cache_key = f"setup:batches:{user_centre or 'all'}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    q = select(Batch)
    if user_centre is not None:
        q = q.where(Batch.centre_id == user_centre)

    rows = db.execute(q.order_by(Batch.name)).scalars().all()
    items = []
    for b in rows:
        centre = db.get(Centre, b.centre_id)
        items.append(BatchOut(
            id=b.id,
            name=b.name,
            centre_id=b.centre_id,
            centre_name=centre.name if centre else "",
            course=b.course,
            course_start=b.course_start,
            course_end=b.course_end,
            total_fee_paise=b.total_fee_paise,
            registration_fee_paise=b.registration_fee_paise,
            instalment_count=b.instalment_count,
            first_due_date=b.first_due_date,
            gap_months=b.gap_months,
        ).model_dump())
    result = {"items": items, "total": len(items)}
    cache.set(cache_key, result, ttl=300)
    return result


@router.post("/batches", status_code=201)
def create_batch(
    body: BatchCreate,
    _: dict = Depends(require_staff("admin")),
    db: Session = Depends(get_db),
):
    """Create a new batch (admin only)."""
    centre = db.get(Centre, body.centre_id)
    if centre is None:
        raise NotFound("NOT_FOUND", "Centre not found.")

    batch = Batch(
        centre_id=body.centre_id,
        name=body.name,
        course=body.course,
        course_start=body.course_start,
        course_end=body.course_end,
        total_fee_paise=body.total_fee_paise,
        registration_fee_paise=body.registration_fee_paise,
        instalment_count=body.instalment_count,
        first_due_date=body.first_due_date,
        gap_months=body.gap_months,
    )
    db.add(batch)
    db.flush()
    cache.delete_pattern("setup:*")
    cache.delete_pattern("dashboard:*")
    return BatchOut(
        id=batch.id,
        name=batch.name,
        centre_id=batch.centre_id,
        centre_name=centre.name,
        course=batch.course,
        course_start=batch.course_start,
        course_end=batch.course_end,
        total_fee_paise=batch.total_fee_paise,
        registration_fee_paise=batch.registration_fee_paise,
        instalment_count=batch.instalment_count,
        first_due_date=batch.first_due_date,
        gap_months=batch.gap_months,
    )

