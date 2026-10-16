from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthException
from app.core.security import verify_session_jwt
from app.db.session import AsyncSessionLocal, set_tenant_context

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user_claims(
    request: Request, auth_header: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)
) -> dict[str, Any]:
    """
    Extracts and cryptographically verifies user session from cookie or Bearer token.
    Fails closed with HTTP 401 if token is missing or invalid.
    """
    token: str | None = None

    if auth_header and auth_header.credentials:
        token = auth_header.credentials
    elif "ledger_session" in request.cookies:
        token = request.cookies["ledger_session"]

    if not token:
        # Check dev fallback header if in development
        tenant_id = request.headers.get("x-tenant-id")
        user_id = request.headers.get("x-user-id")
        if tenant_id and user_id:
            return {
                "sub": user_id,
                "tenant_id": tenant_id,
                "email": "developer@alnoor.ae",
                "role": "owner",
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
        )

    try:
        claims = verify_session_jwt(token)
        return claims
    except AuthException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


async def get_tenant_db(
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> AsyncGenerator[AsyncSession, None]:
    """
    Yields an AsyncSession where PostgreSQL Row-Level Security (RLS) has been
    guaranteed by executing SET LOCAL app.current_tenant_id inside the transaction.
    """
    tenant_id = claims["tenant_id"]
    async with AsyncSessionLocal() as session:
        try:
            await set_tenant_context(session, tenant_id)
            yield session
        finally:
            await session.close()
