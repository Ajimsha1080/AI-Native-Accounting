import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCorporateTax,
  generateCorporateTaxReturnExport,
  CorporateTaxEntityProfile,
  CorporateTaxComputationInput,
  RelatedPartyTransaction
} from './corporate-tax.js';

describe('Milestone 10: UAE Corporate Tax Engine - Tax Advisor Review Scenarios (Federal Decree-Law No. 47 of 2022)', () => {
  test('Scenario 1: Mainland Entity with Art. 32 Entertainment, Art. 33 Fines & Art. 22 Participation Exemption', () => {
    // Mainland entity with AED 12M revenue (SBR not applicable)
    // Net Accounting Profit: AED 2,000,000 (200,000,000 fils)
    // Entertainment Expenses: AED 80,000 (8,000,000 fils) -> 50% Disallowed = AED 40,000 (4,000,000 fils)
    // Traffic & Customs Penalties: AED 25,000 (2,500,000 fils) -> 100% Disallowed = AED 25,000 (2,500,000 fils)
    // Non-Qualifying Donations: AED 15,000 (1,500,000 fils) -> 100% Disallowed = AED 15,000 (1,500,000 fils)
    // Total Add-backs = 4M + 2.5M + 1.5M = 8,000,000 fils (AED 80,000.00)
    // Exempt UAE Subsidiary Dividends (Art. 22): AED 150,000 (15,000,000 fils) -> 100% Deductible
    // Adjusted Taxable Income: 200M + 8M - 15M = 193,000,000 fils (AED 1,930,000.00)
    // Statutory 0% Bracket: AED 375,000 (37,500,000 fils)
    // Taxable Excess: 193,000,000 - 37,500,000 = 155,500,000 fils (AED 1,555,000.00)
    // Tax Due @ 9%: 155,500,000 * 9% = 13,995,000 fils (AED 139,950.00)

    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-dxb-mainland-01',
      entityName: 'Emirates Trading & Contracting LLC',
      trn: '100456789012345',
      jurisdiction: 'MAINLAND',
      isQualifyingFreeZonePerson: false,
      isSmallBusinessReliefElected: false
    };

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 1200000000n, // AED 12M
      netAccountingProfitLossFils: 200000000n, // AED 2M
      entertainmentExpensesFils: 8000000n, // AED 80k
      penaltiesAndFinesFils: 2500000n, // AED 25k
      nonQualifyingDonationsFils: 1500000n, // AED 15k
      exemptDividendsReceivedFils: 15000000n, // AED 150k
      taxLossReliefBfwdFils: 0n
    };

    const result = calculateCorporateTax(input);

    assert.equal(result.disallowedEntertainmentFils, 4000000n);
    assert.equal(result.disallowedPenaltiesFils, 2500000n);
    assert.equal(result.disallowedDonationsFils, 1500000n);
    assert.equal(result.totalTaxAdjustmentsAddBackFils, 8000000n);
    assert.equal(result.exemptDividendsFils, 15000000n);
    assert.equal(result.adjustedTaxableIncomeBeforeLossFils, 193000000n);
    assert.equal(result.finalTaxableIncomeFils, 193000000n);
    assert.equal(result.taxDueFils, 13995000n); // AED 139,950.00
    assert.equal(result.effectiveTaxRateBps, 725n); // 7.25% effective rate
    assert.equal(result.verifyWithTaxAdvisor, true);
    assert.ok(result.lawReferences.some((r) => r.includes('Article 32')));
    assert.ok(result.lawReferences.some((r) => r.includes('Article 33')));
    assert.ok(result.lawReferences.some((r) => r.includes('Article 22')));
  });

  test('Scenario 2: Small Business Relief (SBR Art. 21 & MD 73/2023) - Revenue <= AED 3M results in 0% Tax', () => {
    // Startup with AED 2.4M Gross Revenue (<= AED 3,000,000 threshold)
    // Net Accounting Profit: AED 600,000 (60,000,000 fils)
    // SBR elected -> Tax Due = AED 0 regardless of profit exceeding AED 375,000

    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-sbr-01',
      entityName: 'Dubai Tech Ventures FZ-LLC',
      trn: '100888999000111',
      jurisdiction: 'FREE_ZONE',
      isQualifyingFreeZonePerson: false,
      isSmallBusinessReliefElected: true
    };

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 240000000n, // AED 2.4M (<= AED 3M)
      netAccountingProfitLossFils: 60000000n, // AED 600,000
      entertainmentExpensesFils: 1000000n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 0n
    };

    const result = calculateCorporateTax(input);

    assert.equal(result.isSmallBusinessReliefApplied, true);
    assert.equal(result.taxDueFils, 0n);
    assert.equal(result.effectiveTaxRateBps, 0n);
    assert.ok(result.lawReferences.some((r) => r.includes('Small Business Relief')));
  });

  test('Scenario 3: Qualifying Free Zone Person (QFZP) within De-Minimis Thresholds gets 0% Tax', () => {
    // Free Zone Distribution Entity in JAFZA
    // Total Revenue: AED 50,000,000 (5,000,000,000 fils)
    // Qualifying Revenue: AED 48,500,000 (4,850,000,000 fils)
    // Non-Qualifying Revenue: AED 1,500,000 (150,000,000 fils)
    // Non-Qualifying Ratio = 1.5M / 50M = 3.00% (300 bps <= 500 bps)
    // Non-Qualifying Amount = AED 1.5M <= AED 5,000,000
    // Net Accounting Profit: AED 8,000,000 (800,000,000 fils)

    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-jafza-01',
      entityName: 'JAFZA Global Logistics FZE',
      trn: '100111222333444',
      jurisdiction: 'FREE_ZONE',
      freeZoneName: 'Jebel Ali Free Zone (JAFZA)',
      isQualifyingFreeZonePerson: true,
      isSmallBusinessReliefElected: false
    };

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 5000000000n,
      netAccountingProfitLossFils: 800000000n,
      qualifyingRevenueFils: 4850000000n,
      nonQualifyingRevenueFils: 150000000n,
      entertainmentExpensesFils: 0n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 0n
    };

    const result = calculateCorporateTax(input);

    assert.equal(result.isQfzpDisqualified, false);
    assert.equal(result.qfzpDeMinimisRatioBps, 300n); // 3.00%
    assert.equal(result.taxDueFils, 0n); // 0% Corporate Tax
    assert.ok(result.lawReferences.some((r) => r.includes('Cabinet Decision No. 139 of 2023')));
  });

  test('Scenario 4A: QFZP Disqualified for Breaching 5% De-Minimis Ratio (Taxed at 9%)', () => {
    // Total Revenue: AED 10,000,000 (1,000,000,000 fils)
    // Qualifying Revenue: AED 9,200,000 (920,000,000 fils)
    // Non-Qualifying Revenue: AED 800,000 (80,000,000 fils)
    // Non-Qualifying Ratio = 8.00% (800 bps > 500 bps limit)
    // Disqualified -> Taxed at standard 9% on taxable profit above AED 375k
    // Net Profit: AED 1,500,000 (150,000,000 fils)
    // Taxable Excess: 150M - 37.5M = 112,500,000 fils (AED 1,125,000.00)
    // Tax Due: 112,500,000 * 9% = 10,125,000 fils (AED 101,250.00)

    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-dmcc-fail-01',
      entityName: 'DMCC Consulting FZ-LLC',
      trn: '100222333444555',
      jurisdiction: 'FREE_ZONE',
      freeZoneName: 'DMCC',
      isQualifyingFreeZonePerson: true,
      isSmallBusinessReliefElected: false
    };

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 1000000000n,
      netAccountingProfitLossFils: 150000000n,
      qualifyingRevenueFils: 920000000n,
      nonQualifyingRevenueFils: 80000000n, // 8.00% > 5.00%
      entertainmentExpensesFils: 0n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 0n
    };

    const result = calculateCorporateTax(input);

    assert.equal(result.isQfzpDisqualified, true);
    assert.equal(result.qfzpDeMinimisRatioBps, 800n); // 8.00%
    assert.equal(result.taxDueFils, 10125000n); // AED 101,250.00 (9% standard rate applied)
  });

  test('Scenario 4B: QFZP Disqualified for Breaching AED 5,000,000 Cap despite < 5% Ratio', () => {
    // Large Trading Entity: Total Revenue AED 200,000,000 (20,000,000,000 fils)
    // Qualifying Revenue: AED 194,000,000
    // Non-Qualifying Revenue: AED 6,000,000 (600,000,000 fils)
    // Ratio = 6M / 200M = 3.00% (<= 5%), BUT AED 6M > AED 5,000,000 cap!
    // Disqualified -> Taxed at standard 9%

    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-difc-fail-02',
      entityName: 'DIFC Trading Partners Ltd',
      trn: '100333444555666',
      jurisdiction: 'DIFC',
      freeZoneName: 'DIFC',
      isQualifyingFreeZonePerson: true,
      isSmallBusinessReliefElected: false
    };

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 20000000000n,
      netAccountingProfitLossFils: 3000000000n, // AED 30M
      qualifyingRevenueFils: 19400000000n,
      nonQualifyingRevenueFils: 600000000n, // AED 6M > AED 5M Cap
      entertainmentExpensesFils: 0n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 0n
    };

    const result = calculateCorporateTax(input);

    assert.equal(result.isQfzpDisqualified, true);
    assert.equal(result.qfzpDeMinimisRatioBps, 300n);
    assert.ok(result.taxDueFils > 0n); // 9% tax triggered
  });

  test('Scenario 5: Article 37 Loss Carry-Forward strictly caps relief at 75% of taxable income', () => {
    // Net Accounting Profit: AED 4,000,000 (400,000,000 fils)
    // Brought Forward Tax Losses from 2024: AED 5,000,000 (500,000,000 fils)
    // Statutory Cap: Exactly 75% of AED 4,000,000 = AED 3,000,000 (300,000,000 fils)
    // Final Taxable Income = 4,000,000 - 3,000,000 = AED 1,000,000 (100,000,000 fils)
    // Unutilized Loss Carried Forward to 2026 = 5M - 3M = AED 2,000,000 (200,000,000 fils)
    // Taxable Excess: 100M - 37.5M = 62,500,000 fils (AED 625,000.00)
    // Tax Due: 62,500,000 * 9% = 5,625,000 fils (AED 56,250.00)

    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-loss-relief-01',
      entityName: 'Sharjah Industrial Corp LLC',
      trn: '100555666777888',
      jurisdiction: 'MAINLAND',
      isQualifyingFreeZonePerson: false,
      isSmallBusinessReliefElected: false
    };

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 1500000000n,
      netAccountingProfitLossFils: 400000000n,
      entertainmentExpensesFils: 0n,
      penaltiesAndFinesFils: 0n,
      exemptDividendsReceivedFils: 0n,
      taxLossReliefBfwdFils: 500000000n // AED 5M available
    };

    const result = calculateCorporateTax(input);

    assert.equal(result.utilizedTaxLossFils, 300000000n); // Exactly 75% utilized
    assert.equal(result.unutilizedLossCarriedForwardFils, 200000000n); // AED 2M carried forward
    assert.equal(result.finalTaxableIncomeFils, 100000000n); // AED 1M remaining
    assert.equal(result.taxDueFils, 5625000n); // AED 56,250.00
  });

  test('Scenario 6: Form CT201 Return-Ready Export Generation with Related Party Schedule', () => {
    const entity: CorporateTaxEntityProfile = {
      entityId: 'ent-ct201-01',
      entityName: 'Al-Noor Holding PJSC',
      trn: '100999888777666',
      jurisdiction: 'MAINLAND',
      isQualifyingFreeZonePerson: false,
      isSmallBusinessReliefElected: false
    };

    const relatedParties: RelatedPartyTransaction[] = [
      {
        partyName: 'Al-Noor Saudi Subsidiary Ltd',
        partyTrn: '300123456789001',
        relationship: 'SUBSIDIARY',
        transactionType: 'MANAGEMENT_FEES',
        amountFils: 45000000n, // AED 450k
        isArmsLengthConfirmed: true
      },
      {
        partyName: 'Al-Noor Real Estate Holding',
        relationship: 'PARENT',
        transactionType: 'INTERCOMPANY_LOAN_INTEREST',
        amountFils: 12000000n, // AED 120k
        isArmsLengthConfirmed: true
      }
    ];

    const input: CorporateTaxComputationInput = {
      entity,
      taxPeriodYear: 2025,
      grossRevenueFils: 2500000000n,
      netAccountingProfitLossFils: 350000000n,
      entertainmentExpensesFils: 10000000n, // AED 100k -> 50k addback
      penaltiesAndFinesFils: 5000000n, // AED 50k addback
      exemptDividendsReceivedFils: 20000000n, // AED 200k deduction
      taxLossReliefBfwdFils: 0n,
      relatedPartyTransactions: relatedParties
    };

    const result = calculateCorporateTax(input);
    const exportText = generateCorporateTaxReturnExport(result, relatedParties);

    // Validate Form CT201 statutory contents
    assert.ok(exportText.includes('UAE FEDERAL TAX AUTHORITY (FTA) - CORPORATE TAX RETURN (FORM CT201)'));
    assert.ok(exportText.includes('Al-Noor Holding PJSC'));
    assert.ok(exportText.includes('100999888777666'));
    assert.ok(exportText.includes('Financial Year 2025'));
    assert.ok(exportText.includes('(+) 50% Entertainment Expenditure (Art. 32): AED 50000.00'));
    assert.ok(exportText.includes('(+) Disallowed Penalties and Fines (Art. 33): AED 50000.00'));
    assert.ok(exportText.includes('(-) Exempt Dividends (Participation Exemption Art. 22): AED 200000.00'));
    assert.ok(exportText.includes('Al-Noor Saudi Subsidiary Ltd'));
    assert.ok(exportText.includes('MANAGEMENT_FEES'));
    assert.ok(exportText.includes('VERIFY WITH UAE TAX ADVISOR BEFORE OFFICIAL FILING ON EMARATAX'));
  });
});
