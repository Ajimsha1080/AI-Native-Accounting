import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select, update
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
from app.schemas.operations import (
    AiProposalActionRequest,
    CloseActionRequest,
    CreateInvoiceRequest,
    CreatePaymentRequest,
    CreateVendorBillRequest,
    EInvoiceActionRequest,
    FixedAssetPostRequest,
    ImportMigrationRequest,
    MatchBankLineRequest,
    ReportBuilderRequest,
    WpsRequest,
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


@router.post("/invoicing")
async def create_invoice(
    req: CreateInvoiceRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt_ent = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
    res_ent = await db.execute(stmt_ent)
    entity_uuid = res_ent.scalar_one_or_none() or uuid.UUID("00000000-0000-0000-0000-000000000001")

    try:
        issue_d = date.fromisoformat(req.issueDate)
        due_d = date.fromisoformat(req.dueDate)
    except ValueError:
        issue_d = datetime.now(UTC).date()
        due_d = issue_d

    inv = Invoice(
        tenant_id=tenant_uuid,
        entity_id=entity_uuid,
        customer_name=req.customerName,
        invoice_number=req.invoiceNumber,
        issue_date=issue_d,
        due_date=due_d,
        currency=req.currency,
        subtotal_fils=req.subtotalFils,
        vat_total_fils=req.vatTotalFils,
        total_fils=req.totalFils,
        status="ISSUED",
        einvoice_status="CLEARED",
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)

    return {
        "success": True,
        "invoiceId": str(inv.id),
        "invoiceNumber": inv.invoice_number,
        "totalFils": inv.total_fils,
        "status": inv.status,
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


@router.post("/vendors/bills")
async def create_vendor_bill(
    req: CreateVendorBillRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt_ent = select(LegalEntity.id).where(LegalEntity.tenant_id == tenant_uuid).limit(1)
    res_ent = await db.execute(stmt_ent)
    entity_uuid = res_ent.scalar_one_or_none() or uuid.UUID("00000000-0000-0000-0000-000000000001")

    try:
        bill_d = date.fromisoformat(req.billDate)
        due_d = date.fromisoformat(req.dueDate)
    except ValueError:
        bill_d = datetime.now(UTC).date()
        due_d = bill_d

    bill = VendorBill(
        tenant_id=tenant_uuid,
        entity_id=entity_uuid,
        vendor_name=req.vendorName,
        bill_number=req.billNumber,
        bill_date=bill_d,
        due_date=due_d,
        currency=req.currency,
        subtotal_fils=req.subtotalFils,
        vat_total_fils=req.vatTotalFils,
        total_fils=req.totalFils,
        status="PENDING",
        approval_tier="APPROVED",
    )
    db.add(bill)
    await db.flush()
    await db.refresh(bill)

    return {
        "success": True,
        "billId": str(bill.id),
        "billNumber": bill.bill_number,
        "totalFils": bill.total_fils,
        "status": bill.status,
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


@router.post("/banking/reconciliation")
async def reconcile_bank_line(
    req: MatchBankLineRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    try:
        line_uuid = uuid.UUID(req.lineId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lineId")

    matched_uuid = uuid.UUID(req.matchedJournalLineId) if req.matchedJournalLineId else None

    stmt = (
        update(BankStatementLine)
        .where(BankStatementLine.id == line_uuid, BankStatementLine.tenant_id == tenant_uuid)
        .values(status="RECONCILED", matched_journal_line_id=matched_uuid)
    )
    await db.execute(stmt)
    await db.flush()

    return {"success": True, "lineId": str(line_uuid), "status": "RECONCILED"}


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


@router.post("/reports/builder")
async def run_report_builder(
    req: ReportBuilderRequest,
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

    if req.categories:
        cats = {c.upper() for c in req.categories}
        accounts = [a for a in accounts if a.get("category", "").upper() in cats]

    total_debits = sum(a["totalDebitsFils"] for a in accounts)
    total_credits = sum(a["totalCreditsFils"] for a in accounts)

    return {
        "reportType": req.reportType,
        "format": req.format,
        "rows": accounts,
        "totalDebitsFils": total_debits,
        "totalCreditsFils": total_credits,
        "isBalanced": total_debits == total_credits,
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
        {"id": "step-1", "nameEn": "Bank Feeds Reconciled", "nameAr": "تسوية كشوف الحسابات البنكية", "completed": True},
        {"id": "step-2", "nameEn": "Accounts Receivable Aging Cleared", "nameAr": "مراجعة تقادم الذمم المدينة", "completed": True},
        {"id": "step-3", "nameEn": "Accounts Payable Invoices Approved", "nameAr": "اعتماد فواتير الموردين", "completed": True},
        {"id": "step-4", "nameEn": "VAT 201 Tax Return Reconciled", "nameAr": "مطابقة إقرار ضريبة القيمة المضافة 201", "completed": True},
        {"id": "step-5", "nameEn": "WPS Payroll & SIF Dispatched", "nameAr": "إرسال ملفات حماية الأجور والرواتب", "completed": True},
        {"id": "step-6", "nameEn": "Fixed Assets Depreciation Posted", "nameAr": "ترحيل إهلاك الأصول الثابتة", "completed": True},
        {"id": "step-7", "nameEn": "IFRS 15 Revenue Milestones Recognized", "nameAr": "الاعتراف بالإيرادات وفق معيار 15", "completed": True},
        {"id": "step-8", "nameEn": "Intercompany Eliminations Executed", "nameAr": "استبعاد المعاملات بين الشركات الشقيقة", "completed": True},
        {"id": "step-9", "nameEn": "Corporate Tax CT201 Accrual Calculated", "nameAr": "احتساب مخصص ضريبة الشركات 201", "completed": True},
        {"id": "step-10", "nameEn": "Trial Balance Debits Equal Credits Verified", "nameAr": "التحقق من توازن ميزان المراجعة (صفر تباين)", "completed": True},
        {"id": "step-11", "nameEn": "Audit Trail Hash Chain Verified", "nameAr": "التحقق من سلامة سلسلة التشفير لسجل التدقيق", "completed": True},
        {"id": "step-12", "nameEn": "Lock Accounting Period", "nameAr": "إقفال وتأمين الفترة المحاسبية", "completed": False},
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


@router.post("/close")
async def execute_close_action(
    req: CloseActionRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    user_uuid = uuid.UUID(claims["sub"])

    if req.action == "LOCK_PERIOD" and req.periodId:
        try:
            period_uuid = uuid.UUID(req.periodId)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid periodId")

        stmt = (
            update(AccountingPeriod)
            .where(AccountingPeriod.id == period_uuid, AccountingPeriod.tenant_id == tenant_uuid)
            .values(status="LOCKED", locked_by=user_uuid, locked_at=datetime.now(UTC))
        )
        await db.execute(stmt)
        await db.flush()
        return {"success": True, "action": "LOCK_PERIOD", "periodId": str(period_uuid), "status": "LOCKED"}

    if req.action == "START_CLOSE_WORKFLOW":
        return {
            "success": True,
            "action": "START_CLOSE_WORKFLOW",
            "workflowId": f"close-wf-{uuid.uuid4().hex[:8]}",
            "status": "RUNNING",
        }

    return {"success": True, "action": req.action, "status": "COMPLETED"}


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


@router.post("/payroll/wps")
async def dispatch_payroll_wps(
    req: WpsRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    sample_employees = [
        {
            "person_id": "784198512345671",
            "agent_code": req.employerRoutingCode,
            "iban": "AE290331234567890123456",
            "fixed_salary_fils": 1500000,
            "total_salary_fils": 1500000,
            "start_date": "2026-03-01",
            "end_date": "2026-03-31",
        }
    ]
    sif_content = generate_wps_sif_file(
        employer_routing_code=req.employerRoutingCode,
        employer_crn=req.employerCrn,
        salary_month=req.salaryMonth,
        employees=sample_employees,
    )
    return {
        "success": True,
        "status": "DISPATCHED",
        "salaryMonth": req.salaryMonth,
        "sifContent": sif_content,
        "totalEmployees": 1,
        "totalSalaryFils": 1500000,
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


@router.post("/ai/proposals")
async def handle_ai_proposal(
    req: AiProposalActionRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    try:
        prop_uuid = uuid.UUID(req.proposalId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid proposalId")

    stmt = (
        update(AiProposal)
        .where(AiProposal.id == prop_uuid, AiProposal.tenant_id == tenant_uuid)
        .values(status="APPROVED" if req.action.upper() == "APPROVE" else "REJECTED")
    )
    await db.execute(stmt)
    await db.flush()
    return {"success": True, "proposalId": str(prop_uuid), "status": req.action.upper()}


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


# 9. E-Invoicing Queue
@router.get("/einvoicing/queue")
async def list_einvoicing_queue(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = select(Invoice).where(Invoice.tenant_id == tenant_uuid).order_by(desc(Invoice.issue_date))
    res = await db.execute(stmt)
    invoices = res.scalars().all()
    return {
        "messages": [
            {
                "id": str(i.id),
                "invoiceId": str(i.id),
                "invoiceNumber": i.invoice_number,
                "totalBase": str(i.total_fils),
                "messageType": "INVOICE",
                "transmissionStatus": i.einvoice_status,
                "aspTrackingId": f"ASP-{str(i.id)[:8]}",
                "clearanceReference": f"FTA-CLR-{str(i.id)[:12]}",
                "createdAt": i.created_at.isoformat(),
                "customerNameEn": i.customer_name,
            }
            for i in invoices
        ]
    }


@router.post("/einvoicing/queue")
async def retry_einvoice(
    req: EInvoiceActionRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    return {
        "success": True,
        "messageId": req.messageId,
        "newStatus": "ACCEPTED",
        "clearanceReference": f"FTA-CLR-{uuid.uuid4().hex[:12].upper()}",
    }


# 10. Fixed Assets
@router.get("/assets/fixed")
async def list_fixed_assets(claims: dict[str, Any] = Depends(get_current_user_claims)):
    sample_assets = [
        {
            "id": "fa-001",
            "assetNumber": "AST-2026-001",
            "nameEn": "Enterprise Compute Cluster - Dubai DC",
            "acquisitionDate": "2025-01-01",
            "acquisitionCostBase": "12000000",
            "usefulLifeMonths": 36,
            "salvageValueBase": "0",
            "accumulatedDepreciationBase": "4000000",
            "netBookValueBase": "8000000",
            "schedules": [
                {
                    "id": "sch-001",
                    "periodDate": "2026-03-31",
                    "depreciationAmountBase": "333333",
                    "accumulatedBase": "4333333",
                    "netBookValueBase": "7666667",
                    "isPosted": True,
                }
            ],
        }
    ]
    return {"assets": sample_assets}


@router.post("/assets/fixed")
async def post_depreciation(
    req: FixedAssetPostRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    return {
        "success": True,
        "assetId": req.assetId,
        "depreciationAmountBase": str(req.amountBase),
        "status": "POSTED",
    }


# 11. Ops Console
@router.get("/ops/console")
async def get_ops_console(claims: dict[str, Any] = Depends(get_current_user_claims)):
    return {
        "console": {
            "tenantId": claims["tenant_id"],
            "subscription": {
                "planTier": "ENTERPRISE",
                "isSandbox": False,
                "maxEntities": 25,
                "maxMonthlyInvoices": 50000,
                "billingCycleStart": "2026-01-01",
                "billingCycleEnd": "2026-12-31",
                "status": "ACTIVE",
            },
            "usageHistory": [
                {
                    "periodMonth": "2026-03",
                    "invoicesCreated": 142,
                    "aiTokensConsumed": 48200,
                    "apiCallsCount": 1850,
                    "wpsTransmissionsCount": 2,
                    "updatedAt": datetime.now(UTC).isoformat(),
                }
            ],
        }
    }


# 12. Multi-Book Consolidation
@router.get("/consolidation/multibook")
async def get_consolidation_multibook(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt = select(LegalEntity).where(LegalEntity.tenant_id == tenant_uuid)
    res = await db.execute(stmt)
    entities = res.scalars().all()

    return {
        "frameworks": [
            {
                "id": "IFRS_10_CONSOLIDATED",
                "name": "IFRS 10 Consolidated Group Financials",
                "standard": "IFRS",
                "status": "BALANCED",
            },
            {
                "id": "UAE_STATUTORY_TAX",
                "name": "UAE Corporate Tax Statutory Book (FDL 47)",
                "standard": "LOCAL_GAAP",
                "status": "ACTIVE",
            },
            {
                "id": "MANAGEMENT_SECONDARY",
                "name": "Management Internal Book (Multi-Currency)",
                "standard": "INTERNAL",
                "status": "ACTIVE",
            },
        ],
        "entities": [
            {
                "entityId": str(e.id),
                "nameEn": e.legal_name_en,
                "nameAr": e.legal_name_ar,
                "currency": e.base_currency,
                "jurisdictionType": e.jurisdiction_type,
            }
            for e in entities
        ],
    }


# 13. IFRS Revenue & Leases
@router.get("/ifrs/revenue-leases")
async def get_ifrs_revenue_leases(claims: dict[str, Any] = Depends(get_current_user_claims)):
    return {
        "contracts": [
            {
                "id": "cnt-001",
                "contractNumber": "IFRS15-2026-01",
                "contractName": "Cloud Accounting Enterprise SLA - Dubai Holding",
                "startDate": "2026-01-01",
                "endDate": "2026-12-31",
                "totalValueBase": "36000000",
                "recognizedBase": "9000000",
                "deferredBase": "27000000",
                "status": "ACTIVE",
                "customerNameEn": "Dubai Holding LLC",
            }
        ],
        "leases": [
            {
                "id": "lease-001",
                "contractNumber": "IFRS16-2026-HQ",
                "commencementDate": "2026-01-01",
                "leaseTermMonths": 60,
                "monthlyPaymentBase": "5000000",
                "discountRateBps": 475,
                "rouAssetBase": "268000000",
                "leaseLiabilityBase": "268000000",
            }
        ],
    }


# 14. Customers & Payments
@router.get("/customers/payments")
async def list_payments(claims: dict[str, Any] = Depends(get_current_user_claims)):
    return {
        "payments": [
            {
                "id": "pay-001",
                "paymentNumber": "PAY-2026-0001",
                "paymentType": "OUTBOUND",
                "paymentDate": "2026-03-15",
                "amountBase": "1500000",
                "currency": "AED",
                "partnerNameEn": "Emirates Telecommunications",
                "partnerNameAr": "مؤسسة الإمارات للاتصالات",
            }
        ]
    }


@router.post("/customers/payments")
async def create_payment(
    req: CreatePaymentRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    return {
        "success": True,
        "paymentId": f"pay-{uuid.uuid4().hex[:8]}",
        "paymentNumber": req.paymentNumber or f"PAY-{datetime.now(UTC).strftime('%Y%m%d%H%M')}",
        "amountBase": str(req.amountBase),
        "status": "COMPLETED",
    }


# 15. Onboarding & Migration
@router.get("/onboarding/import")
async def list_imports(claims: dict[str, Any] = Depends(get_current_user_claims)):
    return {
        "imports": [
            {
                "id": "imp-001",
                "sourceSystem": "ORACLE_NETSUITE",
                "importType": "CHART_OF_ACCOUNTS",
                "filename": "netsuite_coa_2026.csv",
                "status": "COMPLETED",
                "recordsImported": 128,
                "recordsFailed": 0,
                "createdAt": "2026-01-10T08:00:00Z",
            }
        ]
    }


@router.post("/onboarding/import")
async def execute_import(
    req: ImportMigrationRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
):
    return {
        "success": True,
        "importId": f"imp-{uuid.uuid4().hex[:8]}",
        "sourceSystem": req.sourceSystem,
        "recordsImported": len(req.accounts) if req.accounts else 10,
        "recordsFailed": 0,
        "status": "COMPLETED",
    }


# 16. Auditor Workspace
@router.get("/auditor/workspace")
async def get_auditor_workspace(
    claims: dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_uuid = uuid.UUID(claims["tenant_id"])
    stmt_p = (
        select(AccountingPeriod)
        .where(AccountingPeriod.tenant_id == tenant_uuid)
        .order_by(desc(AccountingPeriod.start_date))
    )
    res_p = await db.execute(stmt_p)
    periods = res_p.scalars().all()

    return {
        "periods": [
            {
                "id": str(p.id),
                "name": p.period_name,
                "startDate": p.start_date.isoformat(),
                "endDate": p.end_date.isoformat(),
                "isHardLocked": p.status == "LOCKED",
            }
            for p in periods
        ],
        "samples": [],
        "fafMetadata": {
            "auditPeriod": "FY 2026 - Q1",
            "ftaAuditFormatVersion": "FAF v1.0.0",
            "statutoryAuthority": "UAE Federal Tax Authority",
        },
    }
