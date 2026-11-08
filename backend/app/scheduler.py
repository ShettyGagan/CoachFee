"""Automated background scheduler for daily recurring jobs (reminders, etc.)."""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.cache import cache
from app.db import SessionLocal
from app.services.reminders import run_reminder_job

log = logging.getLogger("coaching.scheduler")

_scheduler_task: asyncio.Task | None = None


def seconds_until_next_daily_time(target_hour: int = 9, target_minute: int = 0) -> float:
    """Calculate seconds from now (India time) until the next target time (09:00 AM IST)."""
    now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    target = now_ist.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    if target <= now_ist:
        target += timedelta(days=1)
    return (target - now_ist).total_seconds()


async def _reminder_background_loop():
    """Background task that runs the reminder job automatically every morning at 09:00 AM IST."""
    log.info("Automated reminder background scheduler started.")

    # Grace period on server startup before initial run
    await asyncio.sleep(5)
    try:
        log.info("Running initial automatic reminder check on startup...")
        with SessionLocal() as db:
            result = run_reminder_job(db)
            db.commit()
            cache.delete_pattern("reminders:*")
            cache.delete_pattern("dashboard:*")
            log.info("Initial automatic reminder check complete: %s", result)
    except asyncio.CancelledError:
        return
    except Exception as exc:
        log.warning("Initial automatic reminder check notice: %s", exc)

    while True:
        try:
            delay = seconds_until_next_daily_time(target_hour=9, target_minute=0)
            log.info("Next automated reminder run scheduled in %.1f seconds (at 09:00 AM IST)", delay)
            await asyncio.sleep(delay)

            # Wake up and execute scheduled daily reminders
            log.info("Executing scheduled daily reminder job at 09:00 AM IST...")
            with SessionLocal() as db:
                result = run_reminder_job(db)
                db.commit()
                cache.delete_pattern("reminders:*")
                cache.delete_pattern("dashboard:*")
                log.info("Scheduled daily reminder job finished: %s", result)

        except asyncio.CancelledError:
            log.info("Automated reminder background scheduler stopped.")
            break
        except Exception as exc:
            log.exception("Error in automated reminder scheduler: %s. Retrying in 60s...", exc)
            await asyncio.sleep(60)


def start_scheduler():
    """Start the background reminder worker if not already running."""
    global _scheduler_task
    # Skip background scheduler when running under automated tests
    if os.environ.get("TESTING") == "true":
        return

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running event loop in current thread (e.g. during synchronous unit tests)
        return

    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = loop.create_task(_reminder_background_loop())
        log.info("Background task registered for automated reminders.")


def stop_scheduler():
    """Gracefully cancel the background reminder worker."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None
        log.info("Background task stopped for automated reminders.")

