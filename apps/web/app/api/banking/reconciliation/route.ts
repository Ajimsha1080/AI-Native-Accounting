import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export interface BankStatementLine {
  id: string;
  date: string;
  reference: string;
  description: string;
  amountMinorUnits: string; // fils (+ for credit, - for debit)
  currency: string;
  matchedStatus: 'MATCHED' | 'UNMATCHED' | 'PARTIAL';
  matchedLedgerEntryId?: string;
}

export interface LedgerTransactionLine {
  id: string;
  voucherNumber: string;
  date: string;
  description: string;
  amountMinorUnits: string; // fils (+ for debit, - for credit)
  accountCode: string;
  isReconciled: boolean;
}

export interface AiMatchSuggestion {
  id: string;
  statementLineId: string;
  ledgerLineId: string;
  confidence: number;
  explanationEn: string;
  explanationAr: string;
  matchType: 'EXACT_AMOUNT_AND_DATE' | 'REFERENCE_WIRE_MATCH' | 'PARTIAL_SETTLEMENT' | 'FEES_INCLUDED';
  varianceFils: string;
}

let STATEMENT_LINES: BankStatementLine[] = [
  {
    id: 'stmt-001',
    date: '2026-01-15',
    reference: 'ENBD-IN-981204',
    description: 'CUSTOMER INWARD WIRE AL-FUTTAIM GROUP',
    amountMinorUnits: '10500000', // AED 105,000.00
    currency: 'AED',
    matchedStatus: 'UNMATCHED'
  },
  {
    id: 'stmt-002',
    date: '2026-01-20',
    reference: 'ENBD-OUT-441209',
    description: 'TELEGRAPHIC TRANSFER TO AMAZON DATA SERVICES',
    amountMinorUnits: '-8400000', // -AED 84,000.00
    currency: 'AED',
    matchedStatus: 'MATCHED',
    matchedLedgerEntryId: 'ledg-002'
  },
  {
    id: 'stmt-003',
    date: '2026-01-25',
    reference: 'ENBD-FEE-0019',
    description: 'MONTHLY TREASURY ACCOUNT MAINTENANCE CHARGES',
    amountMinorUnits: '-25000', // -AED 250.00
    currency: 'AED',
    matchedStatus: 'UNMATCHED'
  }
];

let LEDGER_LINES: LedgerTransactionLine[] = [
  {
    id: 'ledg-001',
    voucherNumber: 'JV-2026-0001',
    date: '2026-01-15',
    description: 'Commercial sales payment from Al-Futtaim Group (AR Settlement)',
    amountMinorUnits: '10500000', // AED 105,000.00
    accountCode: '1020',
    isReconciled: false
  },
  {
    id: 'ledg-002',
    voucherNumber: 'BILL-2026-5501',
    date: '2026-01-20',
    description: 'AP Wire payment for AWS cloud infrastructure hosting',
    amountMinorUnits: '-8400000',
    accountCode: '1020',
    isReconciled: true
  },
  {
    id: 'ledg-003',
    voucherNumber: 'JV-2026-0092',
    date: '2026-01-24',
    description: 'Petty cash bank withdrawal',
    amountMinorUnits: '-500000', // AED 5,000.00
    accountCode: '1020',
    isReconciled: false
  }
];

let AI_SUGGESTIONS: AiMatchSuggestion[] = [
  {
    id: 'sugg-001',
    statementLineId: 'stmt-001',
    ledgerLineId: 'ledg-001',
    confidence: 0.99,
    explanationEn: 'Exact amount match (AED 105,000.00) and same date (15 Jan 2026). Counterparty "Al-Futtaim Group" parsed from MT940 Field 86 narrative.',
    explanationAr: 'تطابق تام في القيمة (105,000.00 د.إ) ونفس تاريخ القيد (15 يناير 2026). تم استخراج اسم العميل "مجموعة الفطيم" من الحقل 86 في رسالة MT940.',
    matchType: 'EXACT_AMOUNT_AND_DATE',
    varianceFils: '0'
  },
  {
    id: 'sugg-002',
    statementLineId: 'stmt-003',
    ledgerLineId: 'ledg-003',
    confidence: 0.45,
    explanationEn: 'Bank service charges (AED 250.00) detected without pre-existing ledger entry. Suggest creating automated bank fee adjustment journal.',
    explanationAr: 'تم رصد عمولات مصرفية بقيمة (250.00 د.إ) بدون قيد دفتري مسبق. يُقترح إنشاء قيد تسوية للمصروفات المصرفية آلياً.',
    matchType: 'FEES_INCLUDED',
    varianceFils: '25000'
  }
];

export const GET = withAuth(Permission.BANK_RECONCILE)(async (_req: NextRequest, _ctx) => {
  const bankBalanceMinorUnits = STATEMENT_LINES.reduce((acc, l) => acc + BigInt(l.amountMinorUnits), 1240000000n);
  const ledgerBalanceMinorUnits = LEDGER_LINES.reduce((acc, l) => acc + BigInt(l.amountMinorUnits), 1240000000n);
  const differenceMinorUnits = bankBalanceMinorUnits - ledgerBalanceMinorUnits;

  return NextResponse.json({
    accountName: 'Emirates NBD - Operating (AED)',
    iban: 'AE120260000001234567891',
    currency: 'AED',
    bankBalanceMinorUnits: bankBalanceMinorUnits.toString(),
    ledgerBalanceMinorUnits: ledgerBalanceMinorUnits.toString(),
    differenceMinorUnits: differenceMinorUnits.toString(),
    statements: STATEMENT_LINES,
    ledgerTransactions: LEDGER_LINES,
    suggestions: AI_SUGGESTIONS
  });
});

export const POST = withAuth(Permission.BANK_RECONCILE)(async (request: NextRequest, _ctx) => {
  try {
    const body = await request.json();
    const { action, statementLineId, ledgerLineId } = body;

    if (action === 'MATCH') {
      const stmt = STATEMENT_LINES.find((s) => s.id === statementLineId);
      const ledg = LEDGER_LINES.find((l) => l.id === ledgerLineId);

      if (!stmt || !ledg) {
        return NextResponse.json({ error: 'Statement or ledger line not found' }, { status: 404 });
      }

      stmt.matchedStatus = 'MATCHED';
      stmt.matchedLedgerEntryId = ledg.id;
      ledg.isReconciled = true;

      // Remove applied suggestion
      AI_SUGGESTIONS = AI_SUGGESTIONS.filter((s) => s.statementLineId !== statementLineId);

      return NextResponse.json({ success: true, stmt, ledg });
    }

    if (action === 'AUTO_CREATE_FEE_ENTRY') {
      const stmt = STATEMENT_LINES.find((s) => s.id === statementLineId);
      if (!stmt) return NextResponse.json({ error: 'Statement line not found' }, { status: 404 });

      const newLedgerLine: LedgerTransactionLine = {
        id: `ledg-fee-${Date.now()}`,
        voucherNumber: `JV-2026-FEE-${Math.floor(Math.random() * 900 + 100)}`,
        date: stmt.date,
        description: `Bank service charges: ${stmt.description}`,
        amountMinorUnits: stmt.amountMinorUnits,
        accountCode: '5250',
        isReconciled: true
      };

      LEDGER_LINES.push(newLedgerLine);
      stmt.matchedStatus = 'MATCHED';
      stmt.matchedLedgerEntryId = newLedgerLine.id;
      AI_SUGGESTIONS = AI_SUGGESTIONS.filter((s) => s.statementLineId !== statementLineId);

      return NextResponse.json({ success: true, newLedgerLine, stmt });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
});
