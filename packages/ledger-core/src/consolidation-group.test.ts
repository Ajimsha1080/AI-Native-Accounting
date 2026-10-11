import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConsolidationEngine,
  ConsolidationEntity,
  IntercompanyEliminationPair
} from './consolidation.js';
import {
  FinancialReportBuilder,
  TrialBalanceAccountSummary,
  StatementRowDrillDownVoucher
} from './report-builder.js';

describe('Milestone 9: Multi-Entity Consolidation (IFRS 10), Multi-Book & Performance Target', () => {
  describe('Consolidation of 10 Seeded UAE Entities & Intercompany Eliminations', () => {
    test('Consolidates 10 seeded entities across Emirates and Free Zones, reconciles eliminations, and meets NFR performance (< 10s)', () => {
      // 1. Seed 10 realistic UAE group entities
      const entities: ConsolidationEntity[] = [
        // Entity 1: Parent Holding Company (Dubai Mainland)
        {
          entityId: 'ent-01-holding',
          entityName: 'Al Qasimi Gulf Holdings PJSC (Dubai Mainland)',
          jurisdiction: 'MAINLAND',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-h-cash',
              code: '1010',
              nameEn: 'Cash at Bank (FAB)',
              nameAr: 'النقد في البنك',
              category: 'ASSET',
              debitBalanceBaseFils: 500000000n, // AED 5,000,000
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-h-ar-ic1',
              code: '1150',
              nameEn: 'Intercompany Loan Receivable - Ent 02',
              nameAr: 'ذمم قروض مدينة بين الشركات',
              category: 'ASSET',
              debitBalanceBaseFils: 200000000n, // AED 2,000,000
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-h-ar-ic2',
              code: '1151',
              nameEn: 'Intercompany Management Fee AR - Ent 03',
              nameAr: 'ذمم إدارية مدينة بين الشركات',
              category: 'ASSET',
              debitBalanceBaseFils: 50000000n, // AED 500,000
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-h-cap',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال المصرح به',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 750000000n // AED 7,500,000
            }
          ]
        },
        // Entity 2: Abu Dhabi Commercial Subsidiary
        {
          entityId: 'ent-02-auh',
          entityName: 'Al Qasimi Contracting LLC (Abu Dhabi)',
          jurisdiction: 'MAINLAND',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-02-cash',
              code: '1010',
              nameEn: 'Cash at Bank (ADCB)',
              nameAr: 'النقد في البنك',
              category: 'ASSET',
              debitBalanceBaseFils: 300000000n,
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-02-ap-ic',
              code: '2150',
              nameEn: 'Intercompany Loan Payable - Holding',
              nameAr: 'ذمم قروض دائنة للشركة القابضة',
              category: 'LIABILITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 200000000n // AED 2,000,000 (Matches Holding AR)
            },
            {
              accountId: 'acc-02-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 100000000n
            }
          ]
        },
        // Entity 3: JAFZA Logistics Free Zone
        {
          entityId: 'ent-03-jafza',
          entityName: 'Qasimi Logistics FZE (JAFZA Designated Zone)',
          jurisdiction: 'FREE_ZONE',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-03-wh',
              code: '1510',
              nameEn: 'Warehouse Equipment',
              nameAr: 'معدات المستودعات',
              category: 'ASSET',
              debitBalanceBaseFils: 250000000n,
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-03-ap-ic',
              code: '2151',
              nameEn: 'Intercompany Management Fee AP - Holding',
              nameAr: 'ذمم إدارية دائنة للشركة القابضة',
              category: 'LIABILITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 50000000n // AED 500,000 (Matches Holding AR)
            },
            {
              accountId: 'acc-03-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 200000000n
            }
          ]
        },
        // Entity 4: DAFZA Trading Free Zone
        {
          entityId: 'ent-04-dafza',
          entityName: 'Qasimi Trading FZCO (DAFZA)',
          jurisdiction: 'FREE_ZONE',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-04-inv',
              code: '1210',
              nameEn: 'Inventory Merchandise',
              nameAr: 'بضاعة المخزون',
              category: 'ASSET',
              debitBalanceBaseFils: 150000000n,
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-04-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 150000000n
            }
          ]
        },
        // Entity 5: DIFC Financial Services (USD functional currency)
        {
          entityId: 'ent-05-difc',
          entityName: 'Qasimi Capital Ltd (DIFC)',
          jurisdiction: 'DIFC',
          functionalCurrency: 'USD',
          ownershipPercentage: 100,
          fxRateToBase: 367250000n, // Central Bank peg 3.6725
          trialBalance: [
            {
              accountId: 'acc-05-usd-cash',
              code: '1010',
              nameEn: 'USD Cash at Bank (Standard Chartered DIFC)',
              nameAr: 'النقد بالدولار في البنك',
              category: 'ASSET',
              debitBalanceBaseFils: 100000000n, // $1,000,000 USD -> AED 3,672,500
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-05-usd-eq',
              code: '3010',
              nameEn: 'USD Share Capital',
              nameAr: 'رأس المال بالدولار',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 100000000n // $1,000,000 USD
            }
          ]
        },
        // Entity 6: ADGM Advisory Partners (USD functional currency)
        {
          entityId: 'ent-06-adgm',
          entityName: 'Qasimi Advisory Partners Ltd (ADGM)',
          jurisdiction: 'ADGM',
          functionalCurrency: 'USD',
          ownershipPercentage: 100,
          fxRateToBase: 367250000n,
          trialBalance: [
            {
              accountId: 'acc-06-usd-cash',
              code: '1010',
              nameEn: 'USD Cash (HSBC ADGM)',
              nameAr: 'النقد بالدولار',
              category: 'ASSET',
              debitBalanceBaseFils: 50000000n, // $500,000 USD -> AED 1,836,250
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-06-usd-eq',
              code: '3010',
              nameEn: 'USD Share Capital',
              nameAr: 'رأس المال بالدولار',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 50000000n
            }
          ]
        },
        // Entity 7: Sharjah Manufacturing Plant
        {
          entityId: 'ent-07-shj',
          entityName: 'Qasimi Industrial Manufacturing LLC (Sharjah)',
          jurisdiction: 'MAINLAND',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-07-ppe',
              code: '1610',
              nameEn: 'Factory Machinery',
              nameAr: 'آلات ومعدات المصنع',
              category: 'ASSET',
              debitBalanceBaseFils: 400000000n,
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-07-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 400000000n
            }
          ]
        },
        // Entity 8: Ras Al Khaimah Tourism (80% owned -> 20% Non-Controlling Interest)
        {
          entityId: 'ent-08-rak',
          entityName: 'Al Marjan Hospitality LLC (RAK)',
          jurisdiction: 'MAINLAND',
          functionalCurrency: 'AED',
          ownershipPercentage: 80, // Non-wholly owned
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-08-hotel',
              code: '1620',
              nameEn: 'Resort Real Estate Property',
              nameAr: 'عقارات المنتجع السياحي',
              category: 'ASSET',
              debitBalanceBaseFils: 1000000000n, // AED 10,000,000
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-08-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 1000000000n // 20% NCI = AED 2,000,000
            }
          ]
        },
        // Entity 9: Fujairah Bunkering & Maritime Fuel
        {
          entityId: 'ent-09-fuj',
          entityName: 'Qasimi Maritime Fuel FZE (Fujairah)',
          jurisdiction: 'FREE_ZONE',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-09-fuel',
              code: '1220',
              nameEn: 'Marine Fuel Bunker Inventory',
              nameAr: 'مخزون وقود السفن',
              category: 'ASSET',
              debitBalanceBaseFils: 350000000n,
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-09-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 350000000n
            }
          ]
        },
        // Entity 10: Ajman Building Supplies
        {
          entityId: 'ent-10-ajm',
          entityName: 'Qasimi Building Materials LLC (Ajman)',
          jurisdiction: 'MAINLAND',
          functionalCurrency: 'AED',
          ownershipPercentage: 100,
          fxRateToBase: 100000000n,
          trialBalance: [
            {
              accountId: 'acc-10-cash',
              code: '1010',
              nameEn: 'Cash at Bank (DIB)',
              nameAr: 'النقد في بنك دبي الإسلامي',
              category: 'ASSET',
              debitBalanceBaseFils: 150000000n,
              creditBalanceBaseFils: 0n
            },
            {
              accountId: 'acc-10-eq',
              code: '3010',
              nameEn: 'Share Capital',
              nameAr: 'رأس المال',
              category: 'EQUITY',
              debitBalanceBaseFils: 0n,
              creditBalanceBaseFils: 150000000n
            }
          ]
        }
      ];

      // 2. Define reciprocal intercompany elimination pairs
      const eliminationPairs: IntercompanyEliminationPair[] = [
        // Holding Loan AR vs Entity 2 Loan AP: AED 2,000,000 (200,000,000 fils)
        {
          entityFromId: 'ent-01-holding',
          entityToId: 'ent-02-auh',
          type: 'LOAN_RECEIVABLE_PAYABLE',
          amountFils: 200000000n,
          currency: 'AED',
          fromAccountId: 'acc-h-ar-ic1',
          toAccountId: 'acc-02-ap-ic'
        },
        // Holding Management Fee AR vs Entity 3 Management Fee AP: AED 500,000 (50,000,000 fils)
        {
          entityFromId: 'ent-01-holding',
          entityToId: 'ent-03-jafza',
          type: 'MANAGEMENT_FEE',
          amountFils: 50000000n,
          currency: 'AED',
          fromAccountId: 'acc-h-ar-ic2',
          toAccountId: 'acc-03-ap-ic'
        }
      ];

      // 3. Execute Group Consolidation
      const report = ConsolidationEngine.consolidateGroup(
        '2026-Q1',
        entities,
        eliminationPairs
      );

      // Verify Entity Count
      assert.equal(report.entitiesCount, 10);
      assert.equal(report.entityBreakdowns.length, 10);

      // Verify Intercompany Eliminations: Exactly AED 2,500,000 (250,000,000 fils) eliminated
      assert.equal(report.totalEliminationsFils, 250000000n);
      assert.equal(report.eliminationJournals.length, 2);

      // Verify each elimination journal is balanced (Debits == Credits)
      for (const jv of report.eliminationJournals) {
        const debits = jv.lines
          .filter((l) => l.direction === 'DEBIT')
          .reduce((sum, l) => sum + l.amountBase, 0n);
        const credits = jv.lines
          .filter((l) => l.direction === 'CREDIT')
          .reduce((sum, l) => sum + l.amountBase, 0n);
        assert.equal(debits, credits, 'Elimination journal must be strictly balanced');
      }

      // Verify NCI (Non-Controlling Interest for Entity 8 at 20%): 20% of 10,000,000 AED = 2,000,000 AED (200,000,000 fils)
      assert.equal(report.nonControllingInterestFils, 200000000n);

      // Verify Fundamental IFRS Balance Sheet Equation:
      // Consolidated Assets == Consolidated Liabilities + Consolidated Equity + Non-Controlling Interest
      assert.equal(
        report.isBalanced,
        true,
        'Consolidated Balance Sheet must uphold Assets == Liabilities + Equity + NCI'
      );
      assert.equal(
        report.consolidatedAssetsFils,
        report.consolidatedLiabilitiesFils +
          report.consolidatedEquityFils +
          report.nonControllingInterestFils
      );

      // NFR Benchmark: Consolidation latency must be < 10,000 ms (< 10 seconds)
      assert.ok(
        report.consolidationLatencyMs < 10000,
        `Consolidation latency ${report.consolidationLatencyMs} ms must meet NFR target (< 10,000 ms)`
      );
    });
  });

  describe('Multi-Book Comparative Reporting & Drill-Down Verification', () => {
    test('Builds multi-book comparative report (IFRS Statutory vs UAE Tax Book) with Article 32 non-deductible add-back', () => {
      const ifrsAccounts: TrialBalanceAccountSummary[] = [
        {
          accountId: 'acc-rev',
          code: '4010',
          nameEn: 'Commercial Consulting Revenue',
          nameAr: 'إيرادات الاستشارات التجارية',
          category: 'REVENUE',
          debitBalanceBaseFils: 0n,
          creditBalanceBaseFils: 100000000n // AED 1,000,000
        },
        {
          accountId: 'acc-ent',
          code: '6050',
          nameEn: 'Client Entertainment Expenditure',
          nameAr: 'مصروفات الترفيه والضيافة للعملاء',
          category: 'EXPENSE',
          debitBalanceBaseFils: 10000000n, // AED 100,000 (IFRS: fully expensed)
          creditBalanceBaseFils: 0n
        }
      ];

      // UAE Tax Book: Article 32 disallows 50% of entertainment, so tax deductible expense is only AED 50,000
      const taxAccounts: TrialBalanceAccountSummary[] = [
        {
          accountId: 'acc-rev',
          code: '4010',
          nameEn: 'Commercial Consulting Revenue',
          nameAr: 'إيرادات الاستشارات التجارية',
          category: 'REVENUE',
          debitBalanceBaseFils: 0n,
          creditBalanceBaseFils: 100000000n
        },
        {
          accountId: 'acc-ent',
          code: '6050',
          nameEn: 'Client Entertainment Expenditure',
          nameAr: 'مصروفات الترفيه والضيافة للعملاء',
          category: 'EXPENSE',
          debitBalanceBaseFils: 5000000n, // AED 50,000 (Tax book: 50% non-deductible added back)
          creditBalanceBaseFils: 0n
        }
      ];

      const managementAccounts = [...ifrsAccounts];

      const report = FinancialReportBuilder.buildMultiBookComparative(
        '2026-Q1',
        ifrsAccounts,
        taxAccounts,
        managementAccounts
      );

      // IFRS Profit: 1,000,000 - 100,000 = AED 900,000 (90,000,000 fils)
      assert.equal(report.totalIfrsProfitFils, 90000000n);

      // Taxable Income: 1,000,000 - 50,000 = AED 950,000 (95,000,000 fils) (AED 50k add-back)
      assert.equal(report.totalTaxableIncomeFils, 95000000n);
      assert.equal(report.netTaxAdjustmentsFils, 5000000n); // +AED 50,000 add-back

      // Verify Article 32 citation rationale is attached
      const entRow = report.rows.find((r) => r.accountCode === '6050');
      assert.ok(entRow);
      assert.ok(entRow.taxAdjustmentRationale?.includes('Federal Decree-Law No. 47 of 2022, Article 32'));
    });

    test('Drills down from financial statement row directly to source journal vouchers', () => {
      const summaries: TrialBalanceAccountSummary[] = [
        {
          accountId: 'acc-sal-01',
          code: '4010',
          nameEn: 'Software Licensing Revenue',
          nameAr: 'إيرادات تراخيص البرمجيات',
          category: 'REVENUE',
          debitBalanceBaseFils: 0n,
          creditBalanceBaseFils: 30000000n // AED 300,000
        }
      ];

      const sourceVouchers: StatementRowDrillDownVoucher[] = [
        {
          voucherId: 'vch-101',
          voucherNumber: 'INV-2026-001',
          date: '2026-01-15',
          accountCode: '4010',
          amountFils: 20000000n,
          narration: 'Enterprise ERP License Q1'
        },
        {
          voucherId: 'vch-102',
          voucherNumber: 'INV-2026-002',
          date: '2026-02-10',
          accountCode: '4010',
          amountFils: 10000000n,
          narration: 'Implementation Services'
        }
      ];

      const vouchersMap = new Map([['acc-sal-01', sourceVouchers]]);

      const incomeStatement = FinancialReportBuilder.buildIncomeStatement(
        '2026-Q1',
        summaries,
        vouchersMap
      );

      assert.equal(incomeStatement.revenueRows.length, 1);
      const row = incomeStatement.revenueRows[0];
      assert.ok(row.drillDownVouchers);
      assert.equal(row.drillDownVouchers.length, 2);
      assert.equal(row.drillDownVouchers[0].voucherNumber, 'INV-2026-001');

      // Verify drill-down voucher sum matches the reported statement row amount
      const sumVouchers = row.drillDownVouchers.reduce((s, v) => s + v.amountFils, 0n);
      assert.equal(sumVouchers, row.amountFils);
    });
  });
});
