import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission } from '@ledger-ae/shared-types';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    const { searchParams } = new URL(request.url);
    // Entity context strictly defaults to authenticated session entity if not scoped
    const entityId = searchParams.get('entityId') || session.entityId;

    // Simulated entity-specific financial metrics (minor units in integer fils)
    const isMainland = entityId.includes('mainland') || entityId === 'ent-mainland';
    const isDMCC = entityId.includes('dmcc') || entityId === 'ent-dmcc';
    const isJAFZA = entityId.includes('jafza') || entityId === 'ent-jafza';

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
      tenantId: session.tenantId,
      entityId,
      userRole: session.role,
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
        current_0_30: (arTotalMinorUnits * 50n / 100n).toString(),
        past_31_60: (arTotalMinorUnits * 25n / 100n).toString(),
        past_61_90: (arTotalMinorUnits * 15n / 100n).toString(),
        over_90: (arTotalMinorUnits * 10n / 100n).toString()
      },
      apAgeing: {
        totalMinorUnits: apTotalMinorUnits.toString(),
        current_0_30: (apTotalMinorUnits * 60n / 100n).toString(),
        past_31_60: (apTotalMinorUnits * 20n / 100n).toString(),
        past_61_90: (apTotalMinorUnits * 12n / 100n).toString(),
        over_90: (apTotalMinorUnits * 8n / 100n).toString()
      },
      vatLiability: {
        netPayableMinorUnits: vatLiabilityMinorUnits.toString(),
        outputVatMinorUnits: (vatLiabilityMinorUnits * 150n / 100n).toString(),
        inputVatRecoverableMinorUnits: (vatLiabilityMinorUnits * 50n / 100n).toString(),
        period: '2026-Q1',
        dueDate: '2026-04-28',
        formBoxStatus: 'BOX_1_TO_14_READY',
        isDesignatedZone: isJAFZA
      },
      closeStatus: {
        totalSteps: 12,
        completedSteps: 8,
        period: 'FY2026-P01',
        daysRemaining: 4,
        checklist: [
          { step: 1, name: 'Bank Statement Feeds Reconciled', status: 'COMPLETED' },
          { step: 2, name: 'Accounts Payable 3-Way Match Verified', status: 'COMPLETED' },
          { step: 3, name: 'Billing & Peppol E-Invoice Transmission Cleared', status: 'COMPLETED' },
          { step: 4, name: 'Fixed Asset IAS 16 Depreciation Posted', status: 'COMPLETED' },
          { step: 5, name: 'IFRS 16 Lease Interest & Amortization Accrued', status: 'COMPLETED' },
          { step: 6, name: 'Central Bank WPS Payroll File Reconciled', status: 'COMPLETED' },
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
          amountMinorUnits: '14250000',
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
          amountMinorUnits: '375000',
          costTokens: 1120
        }
      ]
    });
  }
);
