import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get('entityId') || 'group';

  // Role simulation check from header
  const authHeader = request.headers.get('authorization');
  const role = request.headers.get('x-user-role') || 'CHIEF_ACCOUNTANT';

  if (role === 'VIEWER_UNAUTHORIZED') {
    return NextResponse.json(
      { error: 'Insufficient permissions. Requires CHIEF_ACCOUNTANT or FINANCE_DIRECTOR.' },
      { status: 403 }
    );
  }

  // Simulated entity-specific financial metrics (minor units in integer fils)
  const isMainland = entityId === 'ent-mainland';
  const isDMCC = entityId === 'ent-dmcc';
  const isJAFZA = entityId === 'ent-jafza';

  const cashMinorUnits = isMainland
    ? 845000000n // AED 8.45M
    : isDMCC
    ? 420000000n // AED 4.20M
    : isJAFZA
    ? 580000000n // AED 5.80M
    : 1845000000n; // AED 18.45M (Consolidated)

  const arTotalMinorUnits = isMainland ? 320000000n : 624000000n;
  const apTotalMinorUnits = isMainland ? 180000000n : 412000000n;
  const vatLiabilityMinorUnits = isMainland ? 21500000n : isJAFZA ? 0n : 34250000n;

  return NextResponse.json({
    entityId,
    period: 'FY2026-P01',
    cash: {
      totalMinorUnits: cashMinorUnits.toString(),
      currency: 'AED',
      changePercentage: 4.2,
      bankAccounts: [
        { name: 'Emirates NBD - Operating (AED)', iban: 'AE120260000001234567891', minorUnits: (cashMinorUnits * 65n / 100n).toString() },
        { name: 'ADCB - Treasury & Tax (AED)', iban: 'AE550260000009876543210', minorUnits: (cashMinorUnits * 35n / 100n).toString() }
      ]
    },
    arAgeing: {
      totalMinorUnits: arTotalMinorUnits.toString(),
      current_0_30: (arTotalMinorUnits * 65n / 100n).toString(),
      past_31_60: (arTotalMinorUnits * 20n / 100n).toString(),
      past_61_90: (arTotalMinorUnits * 10n / 100n).toString(),
      over_90: (arTotalMinorUnits * 5n / 100n).toString()
    },
    apAgeing: {
      totalMinorUnits: apTotalMinorUnits.toString(),
      current_0_30: (apTotalMinorUnits * 70n / 100n).toString(),
      past_31_60: (apTotalMinorUnits * 18n / 100n).toString(),
      past_61_90: (apTotalMinorUnits * 8n / 100n).toString(),
      over_90: (apTotalMinorUnits * 4n / 100n).toString()
    },
    vatLiability: {
      netPayableMinorUnits: vatLiabilityMinorUnits.toString(),
      outputVatMinorUnits: (vatLiabilityMinorUnits + 94750000n).toString(),
      inputVatRecoverableMinorUnits: '94750000',
      dueDate: '2026-04-28',
      formBoxStatus: 'READY_TO_FILE'
    },
    closeStatus: {
      completedSteps: 8,
      totalSteps: 12,
      period: 'FY 2026 - P01',
      daysRemaining: 4,
      checklist: [
        { step: 1, name: 'Bank Statement Import & Feed Ingestion', status: 'COMPLETED' },
        { step: 2, name: 'AP 3-Way Invoice Matching', status: 'COMPLETED' },
        { step: 3, name: 'Unbilled Revenue Accruals (IFRS 15)', status: 'COMPLETED' },
        { step: 4, name: 'Depreciation & Amortization Run', status: 'COMPLETED' },
        { step: 5, name: 'Intercompany Eliminations (IFRS 10)', status: 'COMPLETED' },
        { step: 6, name: 'FX Mark-to-Market Revaluation', status: 'COMPLETED' },
        { step: 7, name: 'VAT 201 Box Reconciliation', status: 'COMPLETED' },
        { step: 8, name: 'Corporate Tax 9% Provisioning', status: 'COMPLETED' },
        { step: 9, name: 'Trial Balance Out-of-Balance Check (0 Fils)', status: 'IN_PROGRESS' },
        { step: 10, name: 'Partner / CFO Sign-off Review', status: 'PENDING' },
        { step: 11, name: 'Cryptographic Audit Hash Lock', status: 'PENDING' },
        { step: 12, name: 'Period Hard Close & Lock', status: 'PENDING' }
      ]
    },
    aiProposals: [
      {
        id: 'prop-001',
        title: 'Auto-Match Emirates NBD Wire to Invoice INV-2026-0042',
        confidence: 0.98,
        entity: 'Al-Noor Trading LLC',
        suggestedAction: 'POST_RECONCILIATION_ENTRY',
        amountMinorUnits: '14250000', // AED 142,500.00
        costTokens: 1420
      },
      {
        id: 'prop-002',
        title: 'Apply Small Business Relief (SBR) Exemption for Q1 Under Art. 21',
        confidence: 0.95,
        entity: 'Al-Noor Tech DMCC',
        suggestedAction: 'TAX_RELIEF_APPLY',
        amountMinorUnits: '0',
        costTokens: 890
      },
      {
        id: 'prop-003',
        title: 'Flag Blocked Input VAT: Client Entertainment Invoice (Art. 53)',
        confidence: 0.99,
        entity: 'Al-Noor Trading LLC',
        suggestedAction: 'BLOCK_INPUT_VAT',
        amountMinorUnits: '375000', // AED 3,750.00 VAT
        costTokens: 1120
      }
    ]
  });
}
