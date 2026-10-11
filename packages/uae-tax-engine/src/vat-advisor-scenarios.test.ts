import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVat201Return,
  getBoxDrillDown,
  generateFtaAuditFile,
  UaeEmirate,
  VatLineInput
} from './vat201.js';
import { isValidUaeTrn } from './trn-validator.js';

describe('Milestone 4: UAE VAT & Excise - Tax Advisor Review Scenarios & Drill-Down Engine', () => {
  describe('TRN Validation Rules (FTA Statutory Requirements)', () => {
    test('Validates 15-digit UAE TRNs starting with 100', () => {
      assert.equal(isValidUaeTrn('100234567800003'), true);
      assert.equal(isValidUaeTrn('100999888777666'), true);
      assert.equal(isValidUaeTrn('100000000000001'), true);
    });

    test('Rejects invalid TRNs (incorrect length, non-numeric, or non-100 prefix)', () => {
      assert.equal(isValidUaeTrn(''), false);
      assert.equal(isValidUaeTrn('12345'), false); // Too short
      assert.equal(isValidUaeTrn('1002345678000031'), false); // 16 digits
      assert.equal(isValidUaeTrn('200234567800003'), false); // Does not start with 100
      assert.equal(isValidUaeTrn('10023456780000A'), false); // Contains letter
      assert.equal(isValidUaeTrn('   '), false);
    });
  });

  describe('UAE Tax Advisor Review Scenarios (Federal Decree-Law No. 8 of 2017)', () => {
    const SAMPLE_TRN = '100456789012345';
    const SAMPLE_PERIOD = '2026-Q1';

    test('Scenario 1: Multi-Emirate Standard Rated Sales Breakdown (Box 1a to 1g)', () => {
      const lines: VatLineInput[] = [
        // Abu Dhabi retail sale: AED 50,000 (5,000,000 fils) -> VAT AED 2,500 (250,000 fils)
        {
          lineId: 'ln_auh_1',
          voucherId: 'vch_001',
          documentNumber: 'INV-AUH-101',
          transactionDate: '2026-01-15',
          counterpartyName: 'Al Dar Properties PJSC',
          counterpartyTrn: '100111222333444',
          taxCode: 'SR_5_AUH',
          emirate: UaeEmirate.ABU_DHABI,
          netAmountBase: 5000000n,
          description: 'Consulting services performed in Abu Dhabi HQ'
        },
        // Dubai retail sale: AED 120,000 (12,000,000 fils) -> VAT AED 6,000 (600,000 fils)
        {
          lineId: 'ln_dxb_1',
          voucherId: 'vch_002',
          documentNumber: 'INV-DXB-202',
          transactionDate: '2026-02-10',
          counterpartyName: 'Emaar Hospitality LLC',
          counterpartyTrn: '100222333444555',
          taxCode: 'SR_5_DXB',
          emirate: UaeEmirate.DUBAI,
          netAmountBase: 12000000n,
          description: 'Software implementation at Downtown Dubai'
        },
        // Sharjah warehouse logistics: AED 30,000 (3,000,000 fils) -> VAT AED 1,500 (150,000 fils)
        {
          lineId: 'ln_shj_1',
          voucherId: 'vch_003',
          documentNumber: 'INV-SHJ-303',
          transactionDate: '2026-02-28',
          counterpartyName: 'Sharjah Logistics Park FZC',
          counterpartyTrn: '100333444555666',
          taxCode: 'SR_5_SHJ',
          emirate: UaeEmirate.SHARJAH,
          netAmountBase: 3000000n,
          description: 'Warehousing services in SAIF Zone mainland facility'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);

      // Verify individual Emirate sub-boxes
      const auhBox = vatReturn.emirateBreakdown[UaeEmirate.ABU_DHABI];
      assert.equal(auhBox.boxId, '1a');
      assert.equal(auhBox.amountBase, 5000000n);
      assert.equal(auhBox.vatAmountBase, 250000n);

      const dxbBox = vatReturn.emirateBreakdown[UaeEmirate.DUBAI];
      assert.equal(dxbBox.boxId, '1b');
      assert.equal(dxbBox.amountBase, 12000000n);
      assert.equal(dxbBox.vatAmountBase, 600000n);

      const shjBox = vatReturn.emirateBreakdown[UaeEmirate.SHARJAH];
      assert.equal(shjBox.boxId, '1c');
      assert.equal(shjBox.amountBase, 3000000n);
      assert.equal(shjBox.vatAmountBase, 150000n);

      // Other emirates must be 0
      assert.equal(vatReturn.emirateBreakdown[UaeEmirate.AJMAN].amountBase, 0n);
      assert.equal(vatReturn.emirateBreakdown[UaeEmirate.FUJAIRAH].amountBase, 0n);

      // Box 1 Aggregate check: AED 200,000 net -> AED 10,000 VAT (1,000,000 fils)
      const box1 = vatReturn.boxes.find((b) => b.boxId === '1');
      assert.ok(box1);
      assert.equal(box1.amountBase, 20000000n);
      assert.equal(box1.vatAmountBase, 1000000n);
      assert.equal(box1.lineCount, 3);
    });

    test('Scenario 2: Zero-Rated Cross-Border Export with Proof of Exit (Box 4, Article 45)', () => {
      const lines: VatLineInput[] = [
        {
          lineId: 'ln_exp_1',
          voucherId: 'vch_exp_01',
          documentNumber: 'INV-EXP-9001',
          transactionDate: '2026-03-01',
          counterpartyName: 'Acme Global Ltd (London, UK)',
          taxCode: 'ZR_EXP_0',
          netAmountBase: 25000000n, // AED 250,000 (25,000,000 fils)
          description: 'Export of engineering architectural services to UK client'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);
      const box4 = vatReturn.boxes.find((b) => b.boxId === '4');
      assert.ok(box4);
      assert.equal(box4.amountBase, 25000000n);
      assert.equal(box4.vatAmountBase, 0n); // 0% VAT
      assert.equal(vatReturn.totalOutputTax, 0n);
    });

    test('Scenario 3: Reverse Charge Mechanism (RCM - Article 48) on Foreign Cloud Services (Box 3 & Box 10)', () => {
      // Cross-border AWS cloud server invoice: USD 10,000 = AED 36,725.00 (3,672,500 fils)
      // Foreign supplier does not charge UAE VAT; recipient self-accounts under RCM
      const lines: VatLineInput[] = [
        {
          lineId: 'ln_rcm_1',
          voucherId: 'vch_rcm_01',
          documentNumber: 'AWS-INV-77889',
          transactionDate: '2026-02-15',
          counterpartyName: 'Amazon Web Services Inc (USA)',
          taxCode: 'RCM_5',
          netAmountBase: 3672500n,
          isRecoverable: true,
          description: 'Cloud hosting infrastructure for UAE SaaS platform'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);

      // Box 3: Output Tax self-accounted @ 5% = AED 1,836.25 (183,625 fils)
      const box3 = vatReturn.boxes.find((b) => b.boxId === '3');
      assert.ok(box3);
      assert.equal(box3.amountBase, 3672500n);
      assert.equal(box3.vatAmountBase, 183625n);

      // Box 10: Input Tax recovered under RCM = AED 1,836.25 (183,625 fils)
      const box10 = vatReturn.boxes.find((b) => b.boxId === '10');
      assert.ok(box10);
      assert.equal(box10.amountBase, 3672500n);
      assert.equal(box10.vatAmountBase, 183625n);

      // Net impact on tax payable is exactly ZERO (Output VAT 183,625 - Input VAT 183,625)
      assert.equal(vatReturn.netTaxPayableOrReclaimable, 0n);
    });

    test('Scenario 4: Non-Recoverable Blocked Input Tax under Article 53 (Client Entertainment)', () => {
      const lines: VatLineInput[] = [
        // Standard business purchase (Dell Laptops): Recoverable
        {
          lineId: 'ln_pur_1',
          voucherId: 'vch_p01',
          documentNumber: 'INV-DELL-88',
          transactionDate: '2026-01-20',
          counterpartyName: 'Dell Technologies UAE LLC',
          counterpartyTrn: '100444555666777',
          taxCode: 'INPUT_SR_5',
          netAmountBase: 10000000n, // AED 100,000 -> VAT AED 5,000 (500,000 fils)
          isRecoverable: true,
          description: 'Office laptops and monitors'
        },
        // Client VIP Dinner at Burj Al Arab: Non-recoverable under Executive Reg Art 53(1)
        {
          lineId: 'ln_ent_1',
          voucherId: 'vch_p02',
          documentNumber: 'INV-JUM-99',
          transactionDate: '2026-01-25',
          counterpartyName: 'Jumeirah Group LLC',
          counterpartyTrn: '100555666777888',
          taxCode: 'INPUT_BLOCKED_5',
          netAmountBase: 2000000n, // AED 20,000 -> VAT AED 1,000
          isRecoverable: false,
          description: 'Client gala dinner entertainment'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);

      // Box 9: Standard rated expenses
      const box9 = vatReturn.boxes.find((b) => b.boxId === '9');
      assert.ok(box9);
      // Only the Dell laptop VAT (500,000 fils) should be recoverable!
      assert.equal(box9.vatAmountBase, 500000n);
      assert.equal(vatReturn.totalInputTax, 500000n);
      assert.equal(vatReturn.advisorVerificationRequired, true); // Flagged for tax advisor review
    });

    test('Scenario 5: Credit Notes & Adjustments (Article 64 / Box 1 Adjustments Column)', () => {
      const lines: VatLineInput[] = [
        // Original invoice: AED 80,000 (8,000,000 fils) -> VAT AED 4,000 (400,000 fils)
        {
          lineId: 'ln_sal_01',
          voucherId: 'vch_sal_01',
          documentNumber: 'INV-2026-001',
          transactionDate: '2026-01-10',
          counterpartyName: 'Dubai Retail Hub LLC',
          taxCode: 'SR_5_DXB',
          emirate: UaeEmirate.DUBAI,
          netAmountBase: 8000000n
        },
        // Credit Note for returned defective inventory: AED -10,000 (-1,000,000 fils) -> VAT AED -500 (-50,000 fils)
        {
          lineId: 'ln_cn_01',
          voucherId: 'vch_cn_01',
          documentNumber: 'CN-2026-001',
          transactionDate: '2026-01-28',
          counterpartyName: 'Dubai Retail Hub LLC',
          taxCode: 'SR_5_DXB',
          emirate: UaeEmirate.DUBAI,
          netAmountBase: 0n,
          adjustmentAmountBase: -50000n, // Article 64 adjustment
          description: 'Credit note adjustment for returned stock'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);
      const dxbBox = vatReturn.emirateBreakdown[UaeEmirate.DUBAI];
      assert.equal(dxbBox.amountBase, 8000000n);
      assert.equal(dxbBox.adjustmentAmountBase, -50000n);
    });

    test('Scenario 6: Customs Imports via Ports (Box 6) & Adjustments (Box 7)', () => {
      const lines: VatLineInput[] = [
        {
          lineId: 'ln_cst_01',
          voucherId: 'vch_cst_01',
          documentNumber: 'CUSTOMS-DEC-2026-5544',
          transactionDate: '2026-02-05',
          counterpartyName: 'Dubai Customs Authority',
          taxCode: 'CUSTOMS_IMPORT_5',
          netAmountBase: 50000000n, // AED 500,000 CIF import
          description: 'Port Jebel Ali customs cleared container'
        },
        {
          lineId: 'ln_cst_adj_01',
          voucherId: 'vch_cst_adj_01',
          documentNumber: 'CUSTOMS-ADJ-99',
          transactionDate: '2026-02-12',
          counterpartyName: 'Dubai Customs Authority',
          taxCode: 'CUSTOMS_ADJ',
          netAmountBase: 0n,
          adjustmentAmountBase: 100000n, // AED 1,000 supplementary assessment
          description: 'Customs revaluation tariff adjustment'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);
      const box6 = vatReturn.boxes.find((b) => b.boxId === '6');
      assert.ok(box6);
      assert.equal(box6.amountBase, 50000000n);
      assert.equal(box6.vatAmountBase, 2500000n); // 5% of 500k AED = 25k AED

      const box7 = vatReturn.boxes.find((b) => b.boxId === '7');
      assert.ok(box7);
      assert.equal(box7.adjustmentAmountBase, 100000n);
    });

    test('Scenario 7: Full Point-in-Time Drill-Down Invariant (Every Figure Drills to Source Entries)', () => {
      // Build a realistic mixed quarter with standard sales, RCM, exports, expenses, and adjustments
      const comprehensiveLines: VatLineInput[] = [
        {
          lineId: 'l1',
          voucherId: 'v1',
          documentNumber: 'INV-101',
          taxCode: 'SR_5_AUH',
          emirate: UaeEmirate.ABU_DHABI,
          netAmountBase: 10000000n,
          description: 'AUH Project'
        },
        {
          lineId: 'l2',
          voucherId: 'v2',
          documentNumber: 'INV-102',
          taxCode: 'SR_5_DXB',
          emirate: UaeEmirate.DUBAI,
          netAmountBase: 20000000n,
          description: 'DXB Delivery'
        },
        {
          lineId: 'l3',
          voucherId: 'v3',
          documentNumber: 'INV-103',
          taxCode: 'ZR_EXP_0',
          netAmountBase: 15000000n,
          description: 'GCC Offshore Export'
        },
        {
          lineId: 'l4',
          voucherId: 'v4',
          documentNumber: 'INV-104',
          taxCode: 'RCM_5',
          netAmountBase: 5000000n,
          isRecoverable: true,
          description: 'Foreign IT contractor'
        },
        {
          lineId: 'l5',
          voucherId: 'v5',
          documentNumber: 'BILL-201',
          taxCode: 'INPUT_SR_5',
          netAmountBase: 8000000n,
          isRecoverable: true,
          description: 'Office Lease & Utilities'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, comprehensiveLines);

      // Verify every non-empty box drills down to source entries and sums match exactly
      for (const box of vatReturn.boxes) {
        const drillRecords = getBoxDrillDown(vatReturn, box.boxId);
        assert.equal(
          drillRecords.length,
          box.lineCount,
          `Drill-down line count for Box ${box.boxId} must match`
        );

        if (box.boxId !== '14' && drillRecords.length > 0) {
          const sumNet = drillRecords.reduce((acc, r) => acc + r.netAmountBase, 0n);
          const sumVat = drillRecords.reduce((acc, r) => acc + r.vatAmountBase, 0n);
          const sumAdj = drillRecords.reduce((acc, r) => acc + r.adjustmentAmountBase, 0n);

          assert.equal(
            sumNet,
            box.amountBase,
            `Sum of net lines in Box ${box.boxId} must equal box amountBase`
          );
          assert.equal(
            sumVat,
            box.vatAmountBase,
            `Sum of VAT lines in Box ${box.boxId} must equal box vatAmountBase`
          );
          assert.equal(
            sumAdj,
            box.adjustmentAmountBase,
            `Sum of adjustment lines in Box ${box.boxId} must equal box adjustmentAmountBase`
          );

          // Every drill-down record must carry legal reference, doc number, and voucher ID
          for (const record of drillRecords) {
            assert.ok(record.voucherId, 'Voucher ID is mandatory');
            assert.ok(record.documentNumber, 'Document number is mandatory');
            assert.ok(record.lawReference, 'Law reference is mandatory');
          }
        } else if (box.boxId === '14') {
          // Box 14 is the net difference: Total Due Tax (Box 12) - Total Recoverable Tax (Box 13)
          const box12 = vatReturn.boxes.find((b) => b.boxId === '12')!;
          const box13 = vatReturn.boxes.find((b) => b.boxId === '13')!;
          assert.equal(box.vatAmountBase, box12.vatAmountBase - box13.vatAmountBase);
          assert.equal(drillRecords.length, box.lineCount);
        }
      }

      // Test drill-down on specific Emirate sub-box '1a' and '1b'
      const auhDrill = getBoxDrillDown(vatReturn, '1a');
      assert.equal(auhDrill.length, 1);
      assert.equal(auhDrill[0].voucherId, 'v1');
      assert.equal(auhDrill[0].netAmountBase, 10000000n);

      const dxbDrill = getBoxDrillDown(vatReturn, '1b');
      assert.equal(dxbDrill.length, 1);
      assert.equal(dxbDrill[0].voucherId, 'v2');
      assert.equal(dxbDrill[0].netAmountBase, 20000000n);
    });

    test('Scenario 8: Official FTA Tax Audit File (FAF) Export Generation', () => {
      const lines: VatLineInput[] = [
        {
          lineId: 'faf_s1',
          voucherId: 'vch_s01',
          documentNumber: 'INV-2026-99',
          transactionDate: '2026-03-10',
          counterpartyName: 'ADNOC Distribution PJSC',
          counterpartyTrn: '100777888999000',
          taxCode: 'SR_5_AUH',
          emirate: UaeEmirate.ABU_DHABI,
          netAmountBase: 5000000n,
          description: 'Fuel cards fleet management software'
        },
        {
          lineId: 'faf_p1',
          voucherId: 'vch_p01',
          documentNumber: 'BILL-2026-44',
          transactionDate: '2026-03-12',
          counterpartyName: 'Etisalat by e&',
          counterpartyTrn: '100888999000111',
          taxCode: 'INPUT_SR_5',
          netAmountBase: 2000000n,
          description: 'High-speed telecom fibre lines'
        }
      ];

      const vatReturn = calculateVat201Return(SAMPLE_TRN, SAMPLE_PERIOD, lines);

      const fafContent = generateFtaAuditFile(vatReturn, {
        companyNameEn: 'LedgerAE Gulf Holdings LLC',
        companyNameAr: 'ليدجر إيه القابضة ذ.م.م',
        trn: SAMPLE_TRN,
        taxPeriod: SAMPLE_PERIOD,
        currency: 'AED'
      });

      assert.ok(fafContent.includes('--- FTA TAX AUDIT FILE (FAF) ---'));
      assert.ok(fafContent.includes('100456789012345'));
      assert.ok(fafContent.includes('ADNOC Distribution PJSC'));
      assert.ok(fafContent.includes('Etisalat by e&'));
      assert.ok(fafContent.includes('Federal Decree-Law No. 8 of 2017'));
    });
  });
});
