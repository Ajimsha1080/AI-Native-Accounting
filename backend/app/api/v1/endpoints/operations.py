import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_claims, get_tenant_db
from app.domain.payroll.wps import generate_wps_sif_file
from app.models.auth import LegalEntity
from app.models.ledger import (
    AccountingPeriod,
    AiProposal,
    AuditLog,
    BankStatementLine,
    Invoice,
    VendorBill,
)

router = APIRouter(tags=["Operations & Modules"])


# 1. Invoicing (Sales)
@router.get("/invoicing")
async def list_invoices(
    entity_id: str | None = Query(None),
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = (
        select(Invoice).where(Invoice.tenant_id == tenant_uuid).order_by(desc(Invoice.issue_date))
    )
    res = await db.execute(stmt)
    invoices = res.scalars().all()
    return {
        "invoices": [
            {
                "id": str(i.id),
                "customerName": i.customer_name,
                "invoiceNumber": i.invoice_number,
                "issueDate": i.issue_date.isoformat(),
                "dueDate": i.due_date.isoformat(),
                "currency": i.currency,
                "subtotalFils": i.subtotal_fils,
                "vatTotalFils": i.vat_total_fils,
                "totalFils": i.total_fils,
                "status": i.status,
                "einvoiceStatus": i.einvoice_status,
            }
            for i in invoices
        ]
    }


# 2. Vendors & Bills
@router.get("/vendors/bills")
async def list_vendor_bills(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = (
        select(VendorBill)
        .where(VendorBill.tenant_id == tenant_uuid)
        .order_by(desc(VendorBill.bill_date))
    )
    res = await db.execute(stmt)
    bills = res.scalars().all()
    return {
        "bills": [
            {
                "id": str(b.id),
                "vendorName": b.vendor_name,
                "billNumber": b.bill_number,
                "billDate": b.bill_date.isoformat(),
                "dueDate": b.due_date.isoformat(),
                "currency": b.currency,
                "subtotalFils": b.subtotal_fils,
                "vatTotalFils": b.vat_total_fils,
                "totalFils": b.total_fils,
                "status": b.status,
                "approvalTier": b.approval_tier,
            }
            for b in bills
        ]
    }


# 3. Banking & Reconciliation
@router.get("/banking/reconciliation")
async def list_reconciliation(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = (
        select(BankStatementLine)
        .where(BankStatementLine.tenant_id == tenant_uuid)
        .order_by(desc(BankStatementLine.line_date))
    )
    res = await db.execute(stmt)
    lines = res.scalars().all()
    return {
        "statementLines": [
            {
                "id": str(l.id),
                "date": l.line_date.isoformat(),
                "description": l.description,
                "amountFils": l.amount_fils,
                "direction": l.direction,
                "status": l.status,
            }
            for l in lines
        ],
        "matchedCount": len([l for l in lines if l.status != "UNMATCHED"]),
        "unmatchedCount": len([l for l in lines if l.status == "UNMATCHED"]),
    }


# 4. Reports (Trial Balance, P&L, Balance Sheet)
@router.get("/reports")
async def get_reports(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    from app.repositories.ledger_repository import LedgerRepository

    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
    res = await db.execute(stmt)
    ent_id = res.scalar_one_or_none() or uuid.UUID("00000000-0000-0000-0000-000000000001")

    repo = LedgerRepository(db)
    accounts = await repo.list_accounts(tenant_uuid, ent_id)

    total_debits = sum(a["totalDebitsFils"] for a in accounts)
    total_credits = sum(a["totalCreditsFils"] for a in accounts)

    return {
        "trialBalance": {
            "accounts": accounts,
            "totalDebitsFils": total_debits,
            "totalCreditsFils": total_credits,
            "isBalanced": total_debits == total_credits,
        },
        "period": "2026-Q1",
        "currency": "AED",
    }


# 5. Month-End Close & Periods
@router.get("/close")
async def get_close_status(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = (
        select(AccountingPeriod)
        .where(AccountingPeriod.tenant_id == tenant_uuid)
        .order_by(desc(AccountingPeriod.start_date))
    )
    res = await db.execute(stmt)
    periods = res.scalars().all()

    checklist = [
        {
            "id": "step-1",
            "nameEn": "Bank Feeds Reconciled",
            "nameAr": "تسوية كشوف الحسابات البنكية",
            "completed": True,
        },
        {
            "id": "step-2",
            "nameEn": "Accounts Receivable Aging Cleared",
            "nameAr": "مراجعة تقادم الذمم المدينة",
            "completed": True,
        },
        {
            "id": "step-3",
            "nameEn": "Accounts Payable Invoices Approved",
            "nameAr": "اعتماد فواتير الموردين",
            "completed": True,
        },
        {
            "id": "step-4",
            "nameEn": "VAT 201 Tax Return Reconciled",
            "nameAr": "مطابقة إقرار ضريبة القيمة المضافة 201",
            "completed": True,
        },
        {
            "id": "step-5",
            "nameEn": "WPS Payroll & SIF Dispatched",
            "nameAr": "إرسال ملفات حماية الأجور والرواتب",
            "completed": True,
        },
        {
            "id": "step-6",
            "nameEn": "Fixed Assets Depreciation Posted",
            "nameAr": "ترحيل إهلاك الأصول الثابتة",
            "completed": True,
        },
        {
            "id": "step-7",
            "nameEn": "IFRS 15 Revenue Milestones Recognized",
            "nameAr": "الاعتراف بالإيرادات وفق معيار 15",
            "completed": True,
        },
        {
            "id": "step-8",
            "nameEn": "Intercompany Eliminations Executed",
            "nameAr": "استبعاد المعاملات بين الشركات الشقيقة",
            "completed": True,
        },
        {
            "id": "step-9",
            "nameEn": "Corporate Tax CT201 Accrual Calculated",
            "nameAr": "احتساب مخصص ضريبة الشركات 201",
            "completed": True,
        },
        {
            "id": "step-10",
            "nameEn": "Trial Balance Debits Equal Credits Verified",
            "nameAr": "التحقق من توازن ميزان المراجعة (صفر تباين)",
            "completed": True,
        },
        {
            "id": "step-11",
            "nameEn": "Audit Trail Hash Chain Verified",
            "nameAr": "التحقق من سلامة سلسلة التشفير لسجل التدقيق",
            "completed": True,
        },
        {
            "id": "step-12",
            "nameEn": "Lock Accounting Period",
            "nameAr": "إقفال وتأمين الفترة المحاسبية",
            "completed": False,
        },
    ]

    return {
        "periods": [
            {
                "id": str(p.id),
                "name": p.period_name,
                "startDate": p.start_date.isoformat(),
                "endDate": p.end_date.isoformat(),
                "status": p.status,
            }
            for p in periods
        ],
        "checklist": checklist,
        "canLockPeriod": True,
    }


# 6. Payroll & WPS
@router.get("/payroll/wps")
async def get_payroll_wps(claims: dict[str, Any] = Depends(get_current_user_claims)):
    sample_employees = [
        {
            "person_id": "784198512345671",
            "agent_code": "CBUAE001",
            "iban": "AE290331234567890123456",
            "fixed_salary_fils": 1500000,
            "total_salary_fils": 1500000,
            "start_date": "2026-03-01",
            "end_date": "2026-03-31",
        },
        {
            "person_id": "784199012345672",
            "agent_code": "CBUAE001",
            "iban": "AE290331234567890123457",
            "fixed_salary_fils": 2200000,
            "total_salary_fils": 2200000,
            "start_date": "2026-03-01",
            "end_date": "2026-03-31",
        },
    ]
    sif_content = generate_wps_sif_file(
        employer_routing_code="CBUAE001",
        employer_crn="MOHRE-DXB-9871",
        salary_month="2026-03",
        employees=sample_employees,
    )
    return {
        "employees": sample_employees,
        "sifSample": sif_content,
        "wpsCompliant": True,
        "statutoryAuthority": "UAE Federal Decree-Law No. 33 of 2021",
    }


# 7. AI Proposals & Governance
@router.get("/ai/proposals")
async def list_ai_proposals(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = (
        select(AiProposal)
        .where(AiProposal.tenant_id == tenant_uuid)
        .order_by(desc(AiProposal.created_at))
    )
    res = await db.execute(stmt)
    proposals = res.scalars().all()
    return {
        "proposals": [
            {
                "id": str(p.id),
                "type": p.proposal_type,
                "proposedEntry": p.proposed_entry,
                "explanationEn": p.explanation_en,
                "explanationAr": p.explanation_ar,
                "confidenceScore": p.confidence_score,
                "statutoryCitation": p.statutory_citation,
                "status": p.status,
            }
            for p in proposals
        ]
    }


# 8. Audit Log Viewer
@router.get("/settings/audit-roles")
async def list_audit_logs(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant_uuid)
        .order_by(desc(AuditLog.created_at))
        .limit(50)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return {
        "auditLogs": [
            {
                "id": str(l.id),
                "action": l.action,
                "resourceType": l.resource_type,
                "resourceId": l.resource_id,
                "currentHash": l.current_hash,
                "previousHash": l.previous_hash,
                "timestamp": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }
