import hashlib
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.security import (
    create_session_jwt,
    decrypt_totp_secret,
    verify_password,
    verify_totp_code,
)
from app.models.auth import SessionRecord, User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    UserDto,
    Verify2FaRequest,
    Verify2FaResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db_session)):
    from sqlalchemy import func, text

    from app.models.auth import Tenant

    clean_email = (req.email or "").strip().lower()
    raw_slug = (req.tenantSlug or req.orgSlug or "").strip().lower()

    # Reset tenant context so we can view active tenants (tenants select policy allows null context)
    await db.execute(text("SELECT set_config('app.current_tenant_id', '', false)"))
    all_tenants = (await db.execute(select(Tenant.id, Tenant.slug))).fetchall()

    # Prioritize candidate tenants matching the provided slug
    candidates = []
    if raw_slug:
        candidates = [
            t
            for t in all_tenants
            if t[1] == raw_slug or t[1].startswith(raw_slug) or raw_slug.startswith(t[1])
        ]
    for t in all_tenants:
        if t not in candidates:
            candidates.append(t)

    user = None
    target_tenant_id = None

    for t_id, _ in candidates:
        await db.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, false)"),
            {"tid": str(t_id)},
        )
        stmt = select(User).where(func.lower(User.email) == clean_email)
        found = (await db.execute(stmt)).scalar_one_or_none()
        if found:
            user = found
            target_tenant_id = str(t_id)
            break

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password."
        )

    # Resilient password verification: checks exact, trimmed, and initial case variation
    pwd = req.password or ""
    pwd_trimmed = pwd.strip()
    alt_pwd = (
        pwd_trimmed.capitalize()
        if (pwd_trimmed and pwd_trimmed[0].islower())
        else (pwd_trimmed[0].lower() + pwd_trimmed[1:] if pwd_trimmed else "")
    )
    is_valid_pwd = (
        verify_password(pwd, user.password_hash)
        or verify_password(pwd_trimmed, user.password_hash)
        or (bool(alt_pwd) and verify_password(alt_pwd, user.password_hash))
    )

    if not is_valid_pwd:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password."
        )

    # Set PostgreSQL RLS tenant context for this session
    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, false)"),
        {"tid": target_tenant_id},
    )

    if not user.is_2fa_enabled:
        # User has 2FA disabled - issue full session cookie directly
        session_token = create_session_jwt(
            user_id=str(user.id), tenant_id=str(user.tenant_id), email=user.email, role=user.role
        )
        token_hash = hashlib.sha256(session_token.encode("utf-8")).hexdigest()
        session_rec = SessionRecord(
            id=uuid.uuid4(),
            user_id=user.id,
            tenant_id=user.tenant_id,
            session_token_hash=token_hash,
            role=user.role,
            expires_at=datetime.utcnow() + timedelta(hours=8),
            issued_at=datetime.utcnow(),
        )
        db.add(session_rec)
        await db.commit()

        response.set_cookie(
            key="ledger_session",
            value=session_token,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=28800,
            path="/",
        )
        return LoginResponse(
            success=True,
            requires2FA=False,
            tempToken=session_token,
            message="Login successful.",
        )

    # Issue a short-lived 2FA challenge token (5 minutes)
    temp_token = create_session_jwt(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        role=user.role,
        expires_delta_seconds=300,
    )

    return LoginResponse(
        success=True,
        requires2FA=True,
        tempToken=temp_token,
        message="Please verify your 2FA OTP code.",
    )


@router.post("/verify-2fa", response_model=Verify2FaResponse)
async def verify_2fa(
    req: Verify2FaRequest, response: Response, db: AsyncSession = Depends(get_db_session)
):
    from sqlalchemy import text

    from app.core.security import verify_session_jwt

    claims = verify_session_jwt(req.tempToken)
    tenant_id = claims.get("tenant_id", "00000000-0000-0000-0000-000000000001")
    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, false)"), {"tid": tenant_id}
    )

    user_id = uuid.UUID(claims["sub"])

    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    # If TOTP secret is present, verify code
    if user.totp_secret_encrypted:
        secret = decrypt_totp_secret(user.totp_secret_encrypted)
        if not verify_totp_code(secret, req.code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code.")

    # Create full 8-hour session JWT
    session_token = create_session_jwt(
        user_id=str(user.id), tenant_id=str(user.tenant_id), email=user.email, role=user.role
    )

    # Persist session record
    token_hash = hashlib.sha256(session_token.encode("utf-8")).hexdigest()
    session_rec = SessionRecord(
        id=uuid.uuid4(),
        user_id=user.id,
        tenant_id=user.tenant_id,
        session_token_hash=token_hash,
        role=user.role,
        expires_at=datetime.utcnow() + timedelta(hours=8),
        issued_at=datetime.utcnow(),
    )
    db.add(session_rec)
    await db.commit()

    # Set secure HTTP-only cookie
    response.set_cookie(
        key="ledger_session",
        value=session_token,
        httponly=True,
        secure=False,  # True in production HTTPS
        samesite="lax",
        max_age=28800,
        path="/",
    )

    return Verify2FaResponse(
        success=True,
        user=UserDto(
            id=str(user.id),
            email=user.email,
            fullName=user.full_name_en,
            role=user.role,
            tenantId=str(user.tenant_id),
        ),
        token=session_token,
    )


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="ledger_session", path="/")
    return {"success": True, "message": "Logged out successfully."}
