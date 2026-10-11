import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export interface CloseStepItem {
  id: number;
  titleEn: string;
  titleAr: string;
  category: 'RECONCILIATION' | 'ACCRUALS' | 'TAX' | 'CONSOLIDATION' | 'LOCK';
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  assignedRole: string;
  completedAt?: string;
  completedBy?: string;
  automatedVerification: boolean;
}

export interface AuditLogEntry {
  id: string;
  sequenceNumber: number;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  entityId: string;
  payloadHash: string;
  previousHash: string;
  ipAddress: string;
}

export interface RolePermissionItem {
  roleCode: string;
  titleEn: string;
  titleAr: string;
  memberCount: number;
  permissions: string[];
}

let CLOSE_STEPS: CloseStepItem[] = [
  { id: 1, titleEn: 'Bank Statement Import & Feed Ingestion (MT940/CAMT.053)', titleAr: 'استيراد وتغذية كشوف الحسابات المصرفية (MT940/CAMT.053)', category: 'RECONCILIATION', status: 'COMPLETED', assignedRole: 'ACCOUNTANT', completedAt: '2026-01-31 09:15', completedBy: 'Tariq Al-Mansoor', automatedVerification: true },
  { id: 2, titleEn: 'AP 3-Way Invoice Matching & GRN Clearing', titleAr: 'مطابقة فواتير المشتريات الثلاثية وإقفال سندات الاستلام', category: 'RECONCILIATION', status: 'COMPLETED', assignedRole: 'ACCOUNTANT', completedAt: '2026-01-31 11:30', completedBy: 'Tariq Al-Mansoor', automatedVerification: true },
  { id: 3, titleEn: 'Unbilled Revenue Accruals (IFRS 15 Performance Obligations)', titleAr: 'استحقاقات الإيرادات غير المفوترة (المعيار الدولي IFRS 15)', category: 'ACCRUALS', status: 'COMPLETED', assignedRole: 'CHIEF_ACCOUNTANT', completedAt: '2026-01-31 14:00', completedBy: 'Tariq Al-Mansoor', automatedVerification: true },
  { id: 4, titleEn: 'Fixed Assets Depreciation & Amortization Run', titleAr: 'تشغيل استهلاك وإطفاء الأصول الثابتة', category: 'ACCRUALS', status: 'COMPLETED', assignedRole: 'ACCOUNTANT', completedAt: '2026-01-31 15:20', completedBy: 'Tariq Al-Mansoor', automatedVerification: true },
  { id: 5, titleEn: 'Intercompany Eliminations & Balances Reconciliation (IFRS 10)', titleAr: 'استبعادات وتسوية أرصدة ما بين الشركات (IFRS 10)', category: 'CONSOLIDATION', status: 'COMPLETED', assignedRole: 'CHIEF_ACCOUNTANT', completedAt: '2026-01-31 16:45', completedBy: 'Tariq Al-Mansoor', automatedVerification: true },
  { id: 6, titleEn: 'FX Mark-to-Market Revaluation (CBUAE Official Rates)', titleAr: 'إعادة تقييم فروق أسعار العملات الأجنبية بأسعار المصرف المركزي', category: 'ACCRUALS', status: 'COMPLETED', assignedRole: 'CHIEF_ACCOUNTANT', completedAt: '2026-01-31 17:10', completedBy: 'Tariq Al-Mansoor', automatedVerification: true },
  { id: 7, titleEn: 'VAT 201 14-Box Return Finalization & Box 14 Sign-off', titleAr: 'اعتماد إقرار ضريبة القيمة المضافة 201 ومطابقة الخانة 14', category: 'TAX', status: 'COMPLETED', assignedRole: 'TAX_MANAGER', completedAt: '2026-01-31 18:00', completedBy: 'Farah Qasim', automatedVerification: true },
  { id: 8, titleEn: 'Corporate Tax 9% Provisioning & QFZP De-Minimis Check', titleAr: 'مخصص ضريبة الشركات 9% والتحقق من حدود المنطقة الحرة المؤهلة', category: 'TAX', status: 'COMPLETED', assignedRole: 'TAX_MANAGER', completedAt: '2026-01-31 18:30', completedBy: 'Farah Qasim', automatedVerification: true },
  { id: 9, titleEn: 'Trial Balance Out-of-Balance Invariant Verification (0 Fils)', titleAr: 'التحقق الآلي من توازن ميزان المراجعة (فارق 0 فلس)', category: 'RECONCILIATION', status: 'IN_PROGRESS', assignedRole: 'CHIEF_ACCOUNTANT', automatedVerification: true },
  { id: 10, titleEn: 'Partner / CFO Sign-off Review & Disclosure Notes', titleAr: 'مراجعة وتوقيع المدير المالي وملاحظات الإفصاح', category: 'LOCK', status: 'PENDING', assignedRole: 'FINANCE_DIRECTOR', automatedVerification: false },
  { id: 11, titleEn: 'Cryptographic Audit Trail Hash Chain Verification', titleAr: 'التحقق من سلامة سلسلة التجزئة التشفيرية لسجل التدقيق', category: 'LOCK', status: 'PENDING', assignedRole: 'AUDITOR', automatedVerification: true },
  { id: 12, titleEn: 'Period FY2026-P01 Hard Close & Write Lock', titleAr: 'الإقفال النهائي وتجميد القيود للفترة المالية FY2026-P01', category: 'LOCK', status: 'PENDING', assignedRole: 'FINANCE_DIRECTOR', automatedVerification: true }
];

let AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log-001',
    sequenceNumber: 1,
    timestamp: '2026-01-31T09:15:22Z',
    actor: 'Tariq Al-Mansoor',
    actorRole: 'CHIEF_ACCOUNTANT',
    action: 'POST_JOURNAL_VOUCHER (JV-2026-0001)',
    entityId: 'Al-Noor Trading LLC',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    ipAddress: '192.168.1.100'
  },
  {
    id: 'log-002',
    sequenceNumber: 2,
    timestamp: '2026-01-31T11:30:15Z',
    actor: 'Tariq Al-Mansoor',
    actorRole: 'CHIEF_ACCOUNTANT',
    action: 'APPROVE_AP_BILL (BILL-2026-5501)',
    entityId: 'Al-Noor Trading LLC',
    payloadHash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    previousHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ipAddress: '192.168.1.100'
  },
  {
    id: 'log-003',
    sequenceNumber: 3,
    timestamp: '2026-01-31T18:30:45Z',
    actor: 'Farah Qasim',
    actorRole: 'TAX_MANAGER',
    action: 'GENERATE_VAT201_RETURN (2026-Q1)',
    entityId: 'Al-Noor Group (Consolidated)',
    payloadHash: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    previousHash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    ipAddress: '192.168.1.104'
  }
];

const ROLES: RolePermissionItem[] = [
  {
    roleCode: 'FINANCE_DIRECTOR',
    titleEn: 'Finance Director / CFO',
    titleAr: 'المدير المالي التنفيذي',
    memberCount: 2,
    permissions: ['PERIOD_CLOSE_LOCK', 'REPORT_PUBLISH', 'MANAGE_USERS', 'OVERRIDE_CONTROLS', 'SIGN_OFF_DISCLOSURES']
  },
  {
    roleCode: 'CHIEF_ACCOUNTANT',
    titleEn: 'Chief Accountant',
    titleAr: 'رئيس الحسابات',
    memberCount: 4,
    permissions: ['POST_JOURNAL', 'REVERSE_JOURNAL', 'APPROVE_AI_PROPOSALS', 'RUN_CONSOLIDATION', 'MANAGE_COA']
  },
  {
    roleCode: 'TAX_MANAGER',
    titleEn: 'Tax & Compliance Manager',
    titleAr: 'مدير الضرائب والامتثال',
    memberCount: 2,
    permissions: ['GENERATE_VAT201', 'SUBMIT_CT201', 'VALIDATE_TRN', 'AUDIT_EXCISE', 'PEPPOL_TRANSMIT']
  },
  {
    roleCode: 'EXTERNAL_AUDITOR',
    titleEn: 'External Auditor (Read-Only WORM)',
    titleAr: 'مدقق الحسابات الخارجي (قراءة فقط)',
    memberCount: 3,
    permissions: ['VIEW_ALL_REPORTS', 'VERIFY_HASH_CHAIN', 'EXPORT_FAF_AUDIT_FILE', 'INSPECT_WORM_ARCHIVE']
  }
];

export const GET = withAuth(Permission.LEDGER_READ)(async (_req: NextRequest, _ctx) => {
  return NextResponse.json({
    period: 'FY 2026 - P01',
    steps: CLOSE_STEPS,
    auditLogs: AUDIT_LOGS,
    roles: ROLES,
    isHardLocked: false
  });
});

export const POST = withAuth(Permission.LEDGER_LOCK)(async (request: NextRequest, _ctx) => {
  try {
    const body = await request.json();
    const { action, stepId } = body;

    if (action === 'TOGGLE_STEP') {
      const step = CLOSE_STEPS.find((s) => s.id === stepId);
      if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

      step.status = step.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED';
      step.completedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
      step.completedBy = 'Tariq Al-Mansoor';

      // Append new cryptographic audit log entry
      const last = AUDIT_LOGS[AUDIT_LOGS.length - 1];
      const newLog: AuditLogEntry = {
        id: `log-00${AUDIT_LOGS.length + 1}`,
        sequenceNumber: AUDIT_LOGS.length + 1,
        timestamp: new Date().toISOString(),
        actor: 'Tariq Al-Mansoor',
        actorRole: 'CHIEF_ACCOUNTANT',
        action: `CLOSE_CHECKLIST_UPDATE (Step ${step.id}: ${step.status})`,
        entityId: 'Al-Noor Group',
        payloadHash: 'b4c678a1098234fedcba98765432101234567890abcdef1234567890abcdef12',
        previousHash: last.payloadHash,
        ipAddress: '192.168.1.100'
      };
      AUDIT_LOGS.push(newLog);

      return NextResponse.json({ success: true, step, auditLog: newLog });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
});
