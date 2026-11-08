"""
Authentication, authorization and session helpers.

- Password hashing (bcrypt)
- JWT creation / decoding
- Cookie-based session management
- FastAPI dependencies: current_principal, require_staff, require_guardian
- Centre-scope check
- Firebase token verification
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Sequence

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response

from app.config import get_settings

# ──────────────────────── password hashing ──────────────────────── #

def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return ``True`` when *plain* matches *hashed*."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ──────────────────────── JWT ───────────────────────────────────── #

_JWT_ALGORITHM = "HS256"
_JWT_LIFETIME = timedelta(hours=24)


def _jwt_secret() -> str:
    secret = get_settings().JWT_SECRET or os.getenv("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    return secret


def create_jwt(
    sub: int,
    kind: str,
    role: str,
    centre_id: int | None = None,
) -> str:
    """Create a signed JWT with standard claims.

    Parameters
    ----------
    sub:       user / guardian id
    kind:      ``"staff"`` or ``"guardian"``
    role:      ``"admin"`` / ``"accounts"`` / ``"counsellor"`` / ``"parent"``
    centre_id: staff only – ``None`` means all centres
    """
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(sub),
        "kind": kind,
        "role": role,
        "exp": now + _JWT_LIFETIME,
    }
    if centre_id is not None:
        payload["centre_id"] = centre_id
    return jwt.encode(payload, _jwt_secret(), algorithm=_JWT_ALGORITHM)


def decode_jwt(token: str) -> dict[str, Any]:
    """Decode and validate a JWT.  Raises ``jwt.PyJWTError`` on failure."""
    claims = jwt.decode(token, _jwt_secret(), algorithms=[_JWT_ALGORITHM])
    if "sub" in claims and isinstance(claims["sub"], str):
        try:
            claims["sub"] = int(claims["sub"])
        except ValueError:
            pass
    return claims


# ──────────────────────── cookie helpers ───────────────────────── #

_COOKIE_NAME = "session"


def _is_localhost(request_or_host: str | None = None) -> bool:
    """Heuristic – secure flag is off on localhost."""
    if request_or_host is None:
        return True
    host = request_or_host.split(":")[0] if request_or_host else ""
    return host in ("localhost", "127.0.0.1", "0.0.0.0")


def set_session_cookie(response: Response, token: str, *, host: str | None = None) -> None:
    """Set the ``session`` httpOnly cookie on *response*.

    Uses samesite="none" with secure=True in production to support cross-domain deployments (e.g. Vercel + Render).
    """
    is_local = _is_localhost(host)
    secure = not is_local
    samesite = "lax" if is_local else "none"
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=samesite,
        secure=secure,
        max_age=int(_JWT_LIFETIME.total_seconds()),
        path="/",
    )


def clear_session_cookie(response: Response, *, host: str | None = None) -> None:
    """Delete the ``session`` cookie."""
    is_local = _is_localhost(host)
    secure = not is_local
    samesite = "lax" if is_local else "none"
    response.delete_cookie(
        key=_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite=samesite,
        secure=secure,
    )


# ──────────────────────── FastAPI dependencies ─────────────────── #

def current_principal(request: Request) -> dict[str, Any]:
    """Read the JWT from the ``session`` cookie or ``Authorization: Bearer <token>`` header and return claims.

    Raises ``401`` when missing or invalid.
    """
    token = request.cookies.get(_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "Not logged in."}},
        )
    try:
        claims = decode_jwt(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "Session expired or invalid."}},
        )
    return claims


def require_staff(*roles: str):
    """Return a FastAPI dependency that checks ``kind=staff`` and role membership.

    Usage::

        @router.get("/centres", dependencies=[Depends(require_staff("admin", "accounts"))])
        def list_centres(principal=Depends(current_principal)): ...

    If *roles* is empty, any staff role is accepted.
    """

    def _dependency(request: Request) -> dict[str, Any]:
        principal = current_principal(request)
        if principal.get("kind") != "staff":
            raise HTTPException(
                status_code=403,
                detail={"error": {"code": "FORBIDDEN", "message": "Staff access required."}},
            )
        if roles and principal.get("role") not in roles:
            raise HTTPException(
                status_code=403,
                detail={"error": {"code": "FORBIDDEN", "message": "Insufficient role."}},
            )
        return principal

    return _dependency


def require_guardian(request: Request) -> dict[str, Any]:
    """FastAPI dependency that enforces ``kind=guardian``."""
    principal = current_principal(request)
    if principal.get("kind") != "guardian":
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "FORBIDDEN", "message": "Guardian access required."}},
        )
    return principal


# ──────────────────────── centre scope ─────────────────────────── #

def check_centre_scope(user_centre_id: int | None, target_centre_id: int) -> bool:
    """Return ``True`` if the staff user may access *target_centre_id*.

    * ``user_centre_id is None`` → user is allowed to see **all** centres.
    * Otherwise they must match exactly.
    """
    if user_centre_id is None:
        return True
    return user_centre_id == target_centre_id


# ──────────────────────── Firebase OTP verification ────────────── #

@lru_cache(maxsize=1)
def _firebase_app():
    """Initialise the Firebase Admin SDK lazily (once).

    Uses ``lru_cache`` so ``initialize_app`` is only called once per process.
    If the app was already initialised (e.g. in tests) we return the existing one.
    """
    import firebase_admin  # type: ignore[import-untyped]
    from firebase_admin import credentials  # type: ignore[import-untyped]

    # Guard against double-initialisation (raises ValueError if already done)
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass  # not yet initialised — proceed below

    cred_json = get_settings().FIREBASE_SERVICE_ACCOUNT_JSON or os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if cred_json:
        import json

        raw_str = cred_json.strip()
        if (raw_str.startswith("'") and raw_str.endswith("'")) or (raw_str.startswith('"') and raw_str.endswith('"')):
            raw_str = raw_str[1:-1].strip()

        cred_dict = json.loads(raw_str)
        cred = credentials.Certificate(cred_dict)
        return firebase_admin.initialize_app(cred)
    else:
        # Falls back to Application Default Credentials (no argument, not None)
        return firebase_admin.initialize_app()


def verify_firebase_token(id_token: str) -> str:
    """Verify a Firebase ID-token and return the phone number.

    Raises
    ------
    HTTPException 401
        When the token is invalid or does not contain a phone number.
    HTTPException 502
        When the upstream provider is unreachable.
    """
    try:
        from firebase_admin import auth as fb_auth  # type: ignore[import-untyped]

        _firebase_app()  # ensure initialised
        decoded = fb_auth.verify_id_token(id_token)
    except ImportError:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "OTP_PROVIDER_UNAVAILABLE", "message": "OTP provider SDK not available."}},
        )
    except Exception as exc:
        # firebase_admin raises ValueError / auth.InvalidIdTokenError / etc.
        err_name = type(exc).__name__
        if "NetworkError" in err_name or "TransportError" in err_name or "ConnectionError" in err_name:
            raise HTTPException(
                status_code=502,
                detail={"error": {"code": "OTP_PROVIDER_UNAVAILABLE", "message": "OTP provider is unreachable."}},
            )
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "Invalid or expired token."}},
        )

    phone: str | None = decoded.get("phone_number")
    if not phone:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "Token does not contain a phone number."}},
        )
    return phone
