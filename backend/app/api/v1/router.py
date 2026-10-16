from fastapi import APIRouter

from app.api.v1.endpoints import auth, ledger, operations

api_router = APIRouter()

# Authentication & Sessions
api_router.include_router(auth.router)

# Double-Entry Ledger, Chart of Accounts, Journal Entries & VAT 201
api_router.include_router(ledger.router)

# Operations: Invoicing, Vendor Bills, Banking, Reports, Close, Payroll, AI, Audit
api_router.include_router(operations.router)
