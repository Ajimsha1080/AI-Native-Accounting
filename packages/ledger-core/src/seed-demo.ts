import {
  Direction,
  JournalEntryCandidate,
  validateLedgerInvariants
} from './invariants.js';
import { computeVoucherHash } from './hash.js';
import { PeriodManager, PeriodLockStatus } from './period.js';

import { calculateVat201Return } from '../../uae-tax-engine/dist/vat201.js';

export interface SeededCompanyScenario {
  tenantId: string;
  holdingCompanyNameEn: string;
  holdingCompanyNameAr: string;
  entities: {
    mainlandEntityId: string;
    mainlandNameEn: string;
    mainlandTrn: string;
    dmccEntityId: string;
    dmccNameEn: string;
    dmccTrn: string;
  };
  sampleVouchersCount: number;
  vat201NetTaxPayableFils: bigint;
  isLedgerBalanced: boolean;
}

/**
 * Bootstraps realistic production UAE demo data:
 * Holding Group with Mainland Trading Entity and DMCC Free Zone Entity.
 */
export function seedUaeDemoCompany(): SeededCompanyScenario {
  const tenantId = 'ten-uae-falcon-holdings-001';
  const mainlandEntityId = 'ent-falcon-mainland-01';
  const dmccEntityId = 'ent-falcon-dmcc-02';

  const periodManager = new PeriodManager();
  const periodId = 'period-2026-01';

  periodManager.registerPeriod({
    periodId,
    entityId: mainlandEntityId,
    fiscalYear: 2026,
    periodNumber: 1,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: PeriodLockStatus.OPEN
  });

  // Balanced Journal Voucher 1: Capital injection in Emirates NBD
  const v1: JournalEntryCandidate = {
    tenantId,
    entityId: mainlandEntityId,
    bookId: 'book-statutory-ifrs',
    periodId,
    entryNumber: 'VOUCHER-2026-001',
    postingDate: '2026-01-01',
    documentDate: '2026-01-01',
    sourceModule: 'MANUAL',
    memoEn: 'Founders Capital Injection into Emirates NBD Account',
    memoAr: 'إيداع رأس مال المؤسسين في حساب بنك الإمارات دبي الوطني',
    createdBy: 'usr-cfo-001',
    lines: [
      {
        accountId: 'acc-10100-bank-enbd',
        currency: 'AED',
        amountTxn: 50000000n, // AED 500,000.00
        amountBase: 50000000n,
        fxRate: 100000000n,
        direction: Direction.DEBIT
      },
      {
        accountId: 'acc-30100-share-capital',
        currency: 'AED',
        amountTxn: 50000000n,
        amountBase: 50000000n,
        fxRate: 100000000n,
        direction: Direction.CREDIT
      }
    ]
  };

  // Balanced Journal Voucher 2: Standard Rated Commercial Sale with 5% VAT
  const v2: JournalEntryCandidate = {
    tenantId,
    entityId: mainlandEntityId,
    bookId: 'book-statutory-ifrs',
    periodId,
    entryNumber: 'VOUCHER-2026-002',
    postingDate: '2026-01-15',
    documentDate: '2026-01-15',
    sourceModule: 'AR_INVOICE',
    memoEn: 'Consulting Advisory Invoice to Emaar PJSC',
    memoAr: 'فاتورة استشارات لشركة إعمار ش.م.ع',
    createdBy: 'usr-senior-acc',
    lines: [
      {
        accountId: 'acc-11000-ar-emaar',
        currency: 'AED',
        amountTxn: 10500000n, // AED 105,000.00 (inclusive of 5% VAT)
        amountBase: 10500000n,
        fxRate: 100000000n,
        direction: Direction.DEBIT
      },
      {
        accountId: 'acc-40100-consulting-rev',
        currency: 'AED',
        amountTxn: 10000000n, // AED 100,000.00 Revenue
        amountBase: 10000000n,
        fxRate: 100000000n,
        direction: Direction.CREDIT
      },
      {
        accountId: 'acc-20200-vat-output-payable',
        currency: 'AED',
        amountTxn: 500000n, // AED 5,000.00 VAT (5%)
        amountBase: 500000n,
        fxRate: 100000000n,
        direction: Direction.CREDIT,
        vatCode: 'SR_5',
        vatAmountBase: 500000n
      }
    ]
  };

  const val1 = validateLedgerInvariants(v1);
  const val2 = validateLedgerInvariants(v2);

  if (!val1.isValid || !val2.isValid) {
    throw new Error('Seed data invariant validation failed');
  }

  // Calculate VAT 201 for the seeded company
  const vatReturn = calculateVat201Return('100234567800003', '2026-Q1', [
    { taxCode: 'SR_5', netAmountBase: 10000000n }
  ]);

  return {
    tenantId,
    holdingCompanyNameEn: 'Falcon Gulf Holdings LLC',
    holdingCompanyNameAr: 'شركة صقر الخليج القابضة ش.ذ.م.م',
    entities: {
      mainlandEntityId,
      mainlandNameEn: 'Falcon Mainland Commercial LLC',
      mainlandTrn: '100234567800003',
      dmccEntityId,
      dmccNameEn: 'Falcon Tech DMCC',
      dmccTrn: '100987654321001'
    },
    sampleVouchersCount: 2,
    vat201NetTaxPayableFils: vatReturn.netTaxPayableOrReclaimable, // AED 5,000.00
    isLedgerBalanced: val1.isValid && val2.isValid
  };
}
