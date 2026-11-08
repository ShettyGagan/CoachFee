"""Auth routes: staff login, parent OTP verify, logout, me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Guardian, User
from app.schemas import (
    GuardianMeResponse,
    ParentVerifyRequest,
    StaffLoginRequest,
    StaffMeResponse,
)
from app.security import (
    clear_session_cookie,
    create_jwt,
    current_principal,
    set_session_cookie,
    verify_firebase_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/staff/login")
def staff_login(
    body: StaffLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Staff email + password login."""
    user = db.execute(
        select(User).where(User.email == body.email)
    ).scalar_one_or_none()

    # same error for wrong email, wrong password, and inactive user
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."}},
        )

    token = create_jwt(sub=user.id, kind="staff", role=user.role, centre_id=user.centre_id)
    set_session_cookie(response, token, host=request.headers.get("host"))

    return {"id": user.id, "name": user.name, "role": user.role, "centre_id": user.centre_id}


@router.post("/parent/verify")
def parent_verify(
    body: ParentVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Parent OTP verification via Firebase (with DEMO_MODE bypass)."""
    settings = get_settings()

    # DEMO_MODE bypass: tokens of the form DEMO_OTP_<10digits>_<6digits>
    if settings.DEMO_MODE and body.id_token.startswith("DEMO_OTP_"):
        # Format: DEMO_OTP_<phone_10digits>_<otp_6digits>
        parts = body.id_token.split("_")
        # parts = ["DEMO", "OTP", "<phone>", "<code>"]
        if len(parts) >= 3:
            phone = f"+91{parts[2]}"
        else:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "INVALID_DEMO_TOKEN", "message": "Malformed demo token."}},
            )
    else:
        phone = verify_firebase_token(body.id_token)

    guardian = db.execute(
        select(Guardian).where(Guardian.phone == phone)
    ).scalar_one_or_none()

    if guardian is None:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "PHONE_NOT_REGISTERED",
                    "message": "This number is not registered with the institute.",
                }
            },
        )

    token = create_jwt(sub=guardian.id, kind="guardian", role="parent")
    set_session_cookie(response, token, host=request.headers.get("host"))

    return {
        "id": guardian.id,
        "name": guardian.name,
        "language": guardian.language,
        "needs_consent": guardian.consented_at is None,
    }


@router.post("/logout", status_code=204)
def logout(response: Response, _: dict = Depends(current_principal)):
    """Clear the session cookie."""
    clear_session_cookie(response)


@router.get("/me")
def me(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    """Return the current user's profile."""
    if principal["kind"] == "staff":
        user = db.get(User, principal["sub"])
        if user is None:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "UNAUTHENTICATED", "message": "User not found."}},
            )
        return StaffMeResponse(
            id=user.id, name=user.name, role=user.role, centre_id=user.centre_id,
        )
    else:
        guardian = db.get(Guardian, principal["sub"])
        if guardian is None:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "UNAUTHENTICATED", "message": "User not found."}},
            )
        return GuardianMeResponse(
            id=guardian.id,
            name=guardian.name,
            language=guardian.language,
            needs_consent=guardian.consented_at is None,
        )
