import os
import sys
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# In tests, use NullPool to avoid asyncpg connections dangling across pytest event loops.
# In production, use high-throughput connection pooling.
if "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST") or getattr(settings, "ENVIRONMENT", "") == "testing":
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
else:
    engine = create_async_engine(
        settings.DATABASE_URL, echo=False, pool_size=10, max_overflow=20, pool_pre_ping=True
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields a standard database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    """
    Executes PostgreSQL transaction-scoped SET LOCAL for Row-Level Security.
    guarantees that non-superusers cannot access cross-tenant data.
    """
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": tenant_id},
    )
