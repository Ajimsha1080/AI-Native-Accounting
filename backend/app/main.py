import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import (
    AuthException,
    CrossTenantAccessException,
    PeriodLockedException,
    UnbalancedJournalException,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("ledger_ae.api")

app = FastAPI(
    title="LedgerAE API",
    description="Enterprise-Grade AI-Native Double-Entry Accounting Platform for UAE Mid-Market Groups",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Configuration for Next.js Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3005",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Centralized Exception Handlers
@app.exception_handler(UnbalancedJournalException)
async def unbalanced_journal_handler(request: Request, exc: UnbalancedJournalException):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "code": exc.code,
            "message": exc.message,
            "details": exc.details,
        },
    )


@app.exception_handler(PeriodLockedException)
async def period_locked_handler(request: Request, exc: PeriodLockedException):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"success": False, "code": exc.code, "message": exc.message},
    )


@app.exception_handler(CrossTenantAccessException)
async def cross_tenant_handler(request: Request, exc: CrossTenantAccessException):
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"success": False, "code": exc.code, "message": exc.message},
    )


@app.exception_handler(AuthException)
async def auth_exception_handler(request: Request, exc: AuthException):
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"success": False, "code": exc.code, "message": exc.message},
    )


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ledger-ae-backend",
        "environment": settings.ENVIRONMENT,
        "runtime": "Python 3.11/FastAPI",
    }


# Mount v1 API router
app.include_router(api_router, prefix="/api/v1")

# Mount compatibility /api router directly so existing Next.js frontend calls work without path modifications
app.include_router(api_router, prefix="/api")
