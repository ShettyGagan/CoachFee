"""FastAPI application entry-point."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import SessionLocal
from app.exceptions import Conflict, Forbidden, Invalid, NotFound

settings = get_settings()

app = FastAPI(
    title="Coaching Fee System API",
    version="1.0.0",
)

# ---- CORS ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Global exception handlers ----

_STATUS_MAP: dict[type, int] = {
    NotFound: 404,
    Conflict: 409,
    Invalid: 422,
    Forbidden: 403,
}


@app.exception_handler(NotFound)
@app.exception_handler(Conflict)
@app.exception_handler(Invalid)
@app.exception_handler(Forbidden)
async def _app_exception_handler(request: Request, exc: NotFound | Conflict | Invalid | Forbidden) -> JSONResponse:
    status = _STATUS_MAP.get(type(exc), 500)
    return JSONResponse(
        status_code=status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Normalize FastAPI HTTPExceptions to our {error: {code, message}} envelope."""
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        # Already in our format: pass through as-is
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "ERROR", "message": str(detail) if detail else "An error occurred."}},
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return validation errors in our standard error envelope."""
    messages = "; ".join(
        f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}"
        for e in exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": messages}},
    )


# ---- Routers ----
from app.routers import auth, setup, students, payments, parent, gateway, reminders, refunds, dashboard, risk, academics  # noqa: E402

_PREFIX = "/api/v1"

app.include_router(auth.router,       prefix=_PREFIX)
app.include_router(setup.router,      prefix=_PREFIX)
app.include_router(students.router,   prefix=_PREFIX)
app.include_router(payments.router,   prefix=_PREFIX)
app.include_router(parent.router,     prefix=_PREFIX)
app.include_router(gateway.router,    prefix=_PREFIX)
app.include_router(reminders.router,  prefix=_PREFIX)
app.include_router(refunds.router,    prefix=_PREFIX)
app.include_router(dashboard.router,  prefix=_PREFIX)
app.include_router(risk.router,       prefix=_PREFIX)
app.include_router(academics.router,  prefix=_PREFIX)


# ---- Health & Startup ----

@app.on_event("startup")
async def on_startup() -> None:
    """Ensure database tables and relations exist on reload, and start background workers."""
    try:
        from app.db import engine
        from app.models import Base
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"Startup notice: {exc}")

    try:
        from app.scheduler import start_scheduler
        start_scheduler()
    except Exception as exc:
        print(f"Scheduler startup notice: {exc}")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Gracefully stop background scheduler."""
    try:
        from app.scheduler import stop_scheduler
        stop_scheduler()
    except Exception as exc:
        print(f"Scheduler shutdown notice: {exc}")


@app.get("/api/v1/health", tags=["health"])
def health() -> dict[str, str]:
    """Check DB connectivity with SELECT 1."""
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "db_down"})  # type: ignore[return-value]
    return {"status": "ok"}


@app.get("/api/v1/cache/stats", tags=["cache"])
def cache_stats() -> dict:
    """Get active cache engine status, hit/miss metrics, and key count."""
    from app.cache import cache
    return cache.stats()


@app.post("/api/v1/cache/clear", tags=["cache"])
def cache_clear() -> dict:
    """Clear all cached keys."""
    from app.cache import cache
    cache.clear()
    return {"status": "cleared"}
