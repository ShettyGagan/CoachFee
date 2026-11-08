"""Application settings (env) and business constants."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Loaded from environment variables / .env file."""

    DATABASE_URL: str
    DATABASE_URL_DIRECT: str = ""
    JWT_SECRET: str
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_SERVICE_ACCOUNT_JSON: str | None = None
    CORS_ORIGINS: str = "http://localhost:5173"
    DEMO_MODE: bool = False

    # Cashfree Payment Gateway (leave blank to use built-in mock gateway)
    CASHFREE_APP_ID: str = ""
    CASHFREE_SECRET_KEY: str = ""
    CASHFREE_ENV: str = "sandbox"          # "sandbox" or "production"
    FRONTEND_URL: str = "http://localhost:5173"  # used for Cashfree return_url

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


# --------------- Business constants (not env vars) --------------- #

GST_RATE_BP: int = 1800  # 18 % in basis points

REFUND_DEADLINE_DAYS: int = 10

REMINDER_OFFSETS: dict[str, int] = {
    "before_7": -7,
    "before_1": -1,
    "on_due": 0,
    "after_3": 3,
    "after_7": 7,
    "after_15": 15,
}

RISK_WEIGHTS: dict[str, int] = {
    "overdue": 40,
    "attendance": 35,
    "test_trend": 25,
}

RISK_LEVEL_HIGH: int = 60
RISK_LEVEL_MEDIUM: int = 30

FALSE_FLAG_COOLDOWN_DAYS: int = 30

PAY_LINK_TTL_HOURS: int = 24

POLICY_VERSION: str = "2026-11"
