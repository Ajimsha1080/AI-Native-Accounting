import { NextResponse } from 'next/server';

export interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  debitMinorUnits: string; // integer fils
  creditMinorUnits: string; // integer fils
}

export interface JournalEntry {
  id: string;
  voucherNumber: string;
  date: string;
  period: string;
  status: 'DRAFT' | 'VALIDATED' | 'POSTED' | 'REVERSED';
  description: string;
  lines: JournalLine[];
  totalDebitMinorUnits: string;
  totalCreditMinorUnits: string;
  reversalOfId?: string;
}

// In-memory persistent demo ledger store
let JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'jv-2026-001',
    voucherNumber: 'JV-2026-0001',
    date: '2026-01-15',
    period: 'FY2026-P01',
    status: 'POSTED',
    description: 'Commercial sales invoice with 5% VAT to Al-Futtaim Group',
    totalDebitMinorUnits: '10500000',
    totalCreditMinorUnits: '10500000',
    lines: [
      { accountId: 'acc-1200', accountCode: '1200', accountName: 'Trade Accounts Receivable', description: 'Due from Al-Futtaim Group', debitMinorUnits: '10500000', creditMinorUnits: '0' },
      { accountId: 'acc-4010', accountCode: '4010', accountName: 'Commercial Sales Revenue (Standard 5%)', description: 'Base tax supply (Dubai)', debitMinorUnits: '0', creditMinorUnits: '10000000' },
      { accountId: 'acc-2110', accountCode: '2110', accountName: 'Output VAT Payable (Box 1)', description: '5% Output VAT', debitMinorUnits: '0', creditMinorUnits: '500000' }
    ]
  },
  {
    id: 'jv-2026-002',
    voucherNumber: 'JV-2026-0002',
    date: '2026-01-20',
    period: 'FY2026-P01',
    status: 'POSTED',
    description: 'Cloud IT Infrastructure services with Reverse Charge (Art. 48)',
    totalDebitMinorUnits: '2100000',
    totalCreditMinorUnits: '2100000',
    lines: [
      { accountId: 'acc-5010', accountCode: '5010', accountName: 'Cost of Goods Sold (COGS)', description: 'AWS Cloud Hosting', debitMinorUnits: '2000000', creditMinorUnits: '0' },
      { accountId: 'acc-1300', accountCode: '1300', accountName: 'Input VAT Recoverable (Box 9)', description: 'RCM Input VAT Recovery', debitMinorUnits: '100000', creditMinorUnits: '0' },
      { accountId: 'acc-2010', accountCode: '2010', accountName: 'Trade Accounts Payable (AP)', description: 'Due to Amazon Web Services', debitMinorUnits: '0', creditMinorUnits: '2000000' },
      { accountId: 'acc-2110', accountCode: '2110', accountName: 'Output VAT Payable (Box 1)', description: 'RCM Output VAT (Box 3)', debitMinorUnits: '0', creditMinorUnits: '100000' }
    ]
  }
];

export async function GET() {
  return NextResponse.json({
    journals: JOURNAL_ENTRIES,
    total: JOURNAL_ENTRIES.length
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, journal } = body;

    if (action === 'REVERSE') {
      const target = JOURNAL_ENTRIES.find((j) => j.id === body.journalId);
      if (!target) {
        return NextResponse.json({ error: 'Target journal not found' }, { status: 404 });
      }
      if (target.status !== 'POSTED') {
        return NextResponse.json({ error: 'Only POSTED journals can be reversed' }, { status: 400 });
      }

      // Mark original as reversed
      target.status = 'REVERSED';

      // Create reversing entry with flipped debits and credits
      const revLines: JournalLine[] = target.lines.map((l) => ({
        ...l,
        debitMinorUnits: l.creditMinorUnits,
        creditMinorUnits: l.debitMinorUnits,
        description: `Reversal of ${target.voucherNumber}: ${l.description}`
      }));

      const newReversal: JournalEntry = {
        id: `jv-rev-${Date.now()}`,
        voucherNumber: `REV-${target.voucherNumber}`,
        date: new Date().toISOString().split('T')[0],
        period: target.period,
        status: 'POSTED',
        description: `Reversal of voucher ${target.voucherNumber}`,
        lines: revLines,
        totalDebitMinorUnits: target.totalCreditMinorUnits,
        totalCreditMinorUnits: target.totalDebitMinorUnits,
        reversalOfId: target.id
      };

      JOURNAL_ENTRIES.unshift(newReversal);
      return NextResponse.json({ success: true, journal: newReversal, reversedTarget: target });
    }

    // Creating or updating entry (DRAFT, VALIDATE, POST)
    if (!journal || !journal.lines || journal.lines.length < 2) {
      return NextResponse.json(
        { error: 'A journal voucher must contain at least 2 double-entry lines' },
        { status: 400 }
      );
    }

    // Zero-float Integer Balance Verification
    let totalDebit = 0n;
    let totalCredit = 0n;

    for (const line of journal.lines) {
      const d = BigInt(line.debitMinorUnits || '0');
      const c = BigInt(line.creditMinorUnits || '0');
      if (d < 0n || c < 0n) {
        return NextResponse.json({ error: 'Debits and credits cannot be negative' }, { status: 400 });
      }
      totalDebit += d;
      totalCredit += c;
    }

    if (action === 'VALIDATE' || action === 'POST') {
      if (totalDebit !== totalCredit) {
        const variance = totalDebit - totalCredit;
        return NextResponse.json(
          {
            error: `Double-entry invariant violation: Total Debits (${totalDebit} fils) do not equal Total Credits (${totalCredit} fils). Variance: ${variance} fils.`,
            isBalanced: false,
            varianceFils: variance.toString()
          },
          { status: 422 }
        );
      }
    }

    const newEntry: JournalEntry = {
      id: journal.id || `jv-${Date.now()}`,
      voucherNumber: journal.voucherNumber || `JV-2026-${String(JOURNAL_ENTRIES.length + 1).padStart(4, '0')}`,
      date: journal.date || new Date().toISOString().split('T')[0],
      period: 'FY2026-P01',
      status: action === 'POST' ? 'POSTED' : action === 'VALIDATE' ? 'VALIDATED' : 'DRAFT',
      description: journal.description || 'General Journal Voucher',
      lines: journal.lines,
      totalDebitMinorUnits: totalDebit.toString(),
      totalCreditMinorUnits: totalCredit.toString()
    };

    if (journal.id) {
      const idx = JOURNAL_ENTRIES.findIndex((j) => j.id === journal.id);
      if (idx !== -1) JOURNAL_ENTRIES[idx] = newEntry;
      else JOURNAL_ENTRIES.unshift(newEntry);
    } else {
      JOURNAL_ENTRIES.unshift(newEntry);
    }

    return NextResponse.json({ success: true, journal: newEntry, isBalanced: totalDebit === totalCredit });
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error processing journal: ' + err.message }, { status: 500 });
  }
}
