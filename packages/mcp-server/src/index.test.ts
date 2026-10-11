import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LedgerMcpServer } from './server.js';
import {
  AccountingFirmWorkspace,
  ClientFirmProfile,
  UnauthorizedClientScopeError
} from './firm-workspace.js';
import { BillingMeteringEngine } from './metering.js';
import { MigrationImporterEngine, LegacyAccountRecord } from './migration-importers.js';

describe('Milestone 12: Integrations & Platform - Model Context Protocol (MCP) Server', () => {
  const mcp = new LedgerMcpServer();

  test('Lists available MCP tools and scopes read-only by default', () => {
    const tools = mcp.getAvailableTools();
    assert.equal(tools.length, 4);

    const tbTool = tools.find((t) => t.name === 'get_trial_balance_summary');
    assert.ok(tbTool);
    assert.equal(tbTool.isReadOnly, true);

    const propTool = tools.find((t) => t.name === 'create_adjustment_proposal');
    assert.ok(propTool);
    assert.equal(propTool.isReadOnly, true);

    const postTool = tools.find((t) => t.name === 'post_manual_adjustment_entry');
    assert.ok(postTool);
    assert.equal(postTool.isReadOnly, false); // Write tool
  });

  test('Executes read tools without requiring approval tokens', async () => {
    const response = await mcp.executeTool({
      toolName: 'query_vat201_summary',
      arguments: { taxPeriod: '2026-Q1' },
      callerRole: 'EXTERNAL_AUDITOR'
    });

    assert.equal(response.isSuccess, true);
    assert.match(response.content[0].text, /box1StandardRatedAed/);
  });

  test('create_adjustment_proposal creates non-posting proposal without requiring CFO token', async () => {
    const response = await mcp.executeTool({
      toolName: 'create_adjustment_proposal',
      arguments: {
        periodId: 'period-2026-01',
        reason: 'Accrual for unbilled audit fee',
        proposedDebitsFils: '500000',
        proposedCreditsFils: '500000'
      },
      callerRole: 'AI_AGENT'
    });

    assert.equal(response.isSuccess, true);
    const parsed = JSON.parse(response.content[0].text);
    assert.equal(parsed.status, 'PROPOSAL_CREATED_PENDING_APPROVAL');
    assert.ok(parsed.proposalId.startsWith('prop-'));
  });

  test('Rejects write tool when valid CFO approval token is missing', async () => {
    const response = await mcp.executeTool({
      toolName: 'post_manual_adjustment_entry',
      arguments: { periodId: 'p1', amountFils: '1000', reason: 'Audit Adjustment' },
      callerRole: 'JUNIOR_ACCOUNTANT'
    });

    assert.equal(response.isSuccess, false);
    assert.match(
      response.error!,
      /SECURITY VIOLATION: MCP write operations require a verified human CFO approval token/
    );
  });

  test('Permits write tool when valid CFO approval token is supplied', async () => {
    const response = await mcp.executeTool({
      toolName: 'post_manual_adjustment_entry',
      arguments: { periodId: 'p1', amountFils: '1000', reason: 'Audit Adjustment' },
      callerRole: 'CFO',
      approvalToken: 'CFO_APPROVED_SECURE_TOKEN_991'
    });

    assert.equal(response.isSuccess, true);
    assert.match(response.content[0].text, /Adjusting voucher posted successfully/);
  });
});

describe('Milestone 12: Accounting Firm Multi-Client Workspace - Clean Client Scoping', () => {
  const workspace = new AccountingFirmWorkspace();

  const client1: ClientFirmProfile = {
    clientId: 'cli-01',
    clientName: 'Al Shaya Trading LLC',
    trn: '100234567800003',
    jurisdiction: 'MAINLAND',
    pendingTasksCount: 3,
    openPeriodName: 'Feb 2026',
    vatFilingStatus: 'READY_FOR_REVIEW',
    isPeriodCloseOverdue: true
  };

  const client2: ClientFirmProfile = {
    clientId: 'cli-02',
    clientName: 'Gulf FinTech DMCC',
    trn: '100987654321001',
    jurisdiction: 'FREE_ZONE',
    pendingTasksCount: 0,
    openPeriodName: 'Feb 2026',
    vatFilingStatus: 'FILED',
    isPeriodCloseOverdue: false
  };

  workspace.registerClient(client1);
  workspace.registerClient(client2);

  // Staff User assigned ONLY to Client 1
  workspace.registerStaffUser({
    userId: 'usr-staff-ahmed',
    name: 'Ahmed Senior Accountant',
    email: 'ahmed@dubai-cpas.ae',
    role: 'STAFF_ACCOUNTANT',
    assignedClientIds: ['cli-01']
  });

  // Partner User with firm-wide access
  workspace.registerStaffUser({
    userId: 'usr-partner-fatima',
    name: 'Fatima Managing Partner',
    email: 'fatima@dubai-cpas.ae',
    role: 'FIRM_PARTNER',
    assignedClientIds: []
  });

  test('Staff accountant accesses assigned client successfully', () => {
    const client = workspace.getScopedClientOverview('usr-staff-ahmed', 'cli-01');
    assert.equal(client.clientName, 'Al Shaya Trading LLC');
  });

  test('Staff accountant accessing unassigned client is strictly rejected with UnauthorizedClientScopeError', () => {
    assert.throws(
      () => workspace.getScopedClientOverview('usr-staff-ahmed', 'cli-02'),
      UnauthorizedClientScopeError
    );
  });

  test('Managing partner has portfolio-wide access to all clients', () => {
    const clients = workspace.listScopedClients('usr-partner-fatima');
    assert.equal(clients.length, 2);

    const client2 = workspace.getScopedClientOverview('usr-partner-fatima', 'cli-02');
    assert.equal(client2.clientName, 'Gulf FinTech DMCC');
  });

  test('Firm portfolio health reports accurate aggregate metrics', () => {
    const health = workspace.getFirmPortfolioHealth();
    assert.equal(health.totalClients, 2);
    assert.equal(health.readyForVatReview, 1);
    assert.equal(health.overdueClose, 1);
    assert.equal(health.totalPendingTasks, 3);
  });
});

describe('Milestone 12: Billing & Usage Metering Engine', () => {
  test('Tracks AI tokens, e-invoices, and active entities with budget threshold alerts', () => {
    const metering = new BillingMeteringEngine();
    const tenantId = 'ten-uae-conglomerate-01';
    const month = '2026-07';

    metering.setEntityCount(tenantId, month, 5); // 5 entities (3 included + 2 extra)
    metering.recordEInvoiceTransmitted(tenantId, month);
    metering.recordEInvoiceTransmitted(tenantId, month);
    metering.recordEInvoiceTransmitted(tenantId, month); // 3 e-invoices

    // Record AI usage below threshold
    metering.recordAiUsage(tenantId, month, 50000, 25000, 200000n); // AED 2,000.00
    let record = metering.getOrCreateRecord(tenantId, month, 500000n); // AED 5,000 budget cap
    assert.equal(record.isBudgetThresholdExceeded, false);

    // Record AI usage breaching 100% budget cap
    metering.recordAiUsage(tenantId, month, 100000, 50000, 350000n); // Additional AED 3,500.00 -> Total AED 5,500.00
    record = metering.getOrCreateRecord(tenantId, month, 500000n);
    assert.equal(record.isBudgetThresholdExceeded, true);
    assert.ok(record.budgetAlertMessage?.includes('CRITICAL'));

    // Generate Itemized Monthly Billing Statement
    const statement = metering.generateMonthlyBillingStatement(tenantId, month);
    assert.equal(statement.baseSubscriptionAedFils, 15000000n); // AED 1,500 base
    assert.equal(statement.additionalEntitiesChargeAedFils, 6000000n); // 2 extra entities * AED 300 = AED 600
    assert.equal(statement.eInvoiceUsageChargeAedFils, 45000n); // 3 invoices * AED 1.50 = AED 4.50 (45,000 fils)
    assert.ok(statement.aiUsageChargeAedFils > 0n);
    assert.ok(statement.vat5PctAedFils > 0n);
    assert.ok(statement.totalDueAedFils > statement.subtotalAedFils);
    assert.ok(statement.itemizedSummary.some((s) => s.includes('UAE VAT (5%)')));
  });
});

describe('Milestone 12: Migration Importers (Zoho Books, QuickBooks Online, Tally Prime)', () => {
  test('Zoho Books Importer: Maps accounts and verifies opening balance debits == credits', () => {
    const zohoAccounts: LegacyAccountRecord[] = [
      {
        legacyAccountId: 'zb-101',
        legacyAccountName: 'Emirates NBD Current Account',
        legacyAccountType: 'Bank',
        openingDebitFils: 25000000n, // AED 250k Dr
        openingCreditFils: 0n,
        currency: 'AED'
      },
      {
        legacyAccountId: 'zb-201',
        legacyAccountName: 'Trade Accounts Receivable',
        legacyAccountType: 'Current Asset',
        openingDebitFils: 15000000n, // AED 150k Dr
        openingCreditFils: 0n,
        currency: 'AED'
      },
      {
        legacyAccountId: 'zb-301',
        legacyAccountName: 'Trade Accounts Payable',
        legacyAccountType: 'Current Liability',
        openingDebitFils: 0n,
        openingCreditFils: 10000000n, // AED 100k Cr
        currency: 'AED'
      },
      {
        legacyAccountId: 'zb-401',
        legacyAccountName: 'Share Capital',
        legacyAccountType: 'Equity',
        openingDebitFils: 0n,
        openingCreditFils: 30000000n, // AED 300k Cr
        currency: 'AED'
      }
    ];

    const result = MigrationImporterEngine.importZohoBooks(zohoAccounts);
    assert.equal(result.isBalanced, true);
    assert.equal(result.varianceFils, 0n);
    assert.equal(result.totalDebitsFils, 40000000n);
    assert.equal(result.totalCreditsFils, 40000000n);
    assert.equal(result.totalAccountsImported, 4);
    assert.equal(result.validationErrors.length, 0);
  });

  test('Rejects imbalanced migration import with clear variance warning', () => {
    const imbalancedQbo: LegacyAccountRecord[] = [
      {
        legacyAccountId: 'qbo-101',
        legacyAccountName: 'Cash on Hand',
        legacyAccountType: 'Bank',
        openingDebitFils: 5000000n, // AED 50k
        openingCreditFils: 0n,
        currency: 'AED'
      },
      {
        legacyAccountId: 'qbo-201',
        legacyAccountName: 'Accounts Payable',
        legacyAccountType: 'Liability',
        openingDebitFils: 0n,
        openingCreditFils: 4000000n, // AED 40k -> AED 10k deficit
        currency: 'AED'
      }
    ];

    const result = MigrationImporterEngine.importQuickBooks(imbalancedQbo);
    assert.equal(result.isBalanced, false);
    assert.equal(result.varianceFils, 1000000n); // AED 10,000 variance
    assert.ok(result.validationErrors[0].includes('Trial Balance out of balance'));
  });

  test('Tally Prime Importer: Maps Sundry Debtors and Duties & Taxes to UAE categories', () => {
    const tallyLedgers: LegacyAccountRecord[] = [
      {
        legacyAccountId: 'tal-01',
        legacyAccountName: 'Dubai Commercial Bank',
        legacyAccountType: 'Bank Accounts',
        openingDebitFils: 10000000n,
        openingCreditFils: 0n,
        currency: 'AED'
      },
      {
        legacyAccountId: 'tal-02',
        legacyAccountName: 'Capital Account',
        legacyAccountType: 'Capital Account',
        openingDebitFils: 0n,
        openingCreditFils: 10000000n,
        currency: 'AED'
      }
    ];

    const result = MigrationImporterEngine.importTallyPrime(tallyLedgers);
    assert.equal(result.isBalanced, true);
    assert.equal(result.mappedAccounts[0].accountCategory, 'ASSET');
    assert.equal(result.mappedAccounts[1].accountCategory, 'EQUITY');
  });
});
