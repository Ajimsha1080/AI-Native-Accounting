import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LedgerMcpServer } from './server.js';
import { McpSecurityService } from './auth-tokens.js';
import {
  AccountingFirmWorkspace,
  ClientFirmProfile,
  UnauthorizedClientScopeError
} from './firm-workspace.js';
import { BillingMeteringEngine } from './metering.js';
import { MigrationImporterEngine, LegacyAccountRecord } from './migration-importers.js';

describe('Phase 8: Official MCP SDK Server, Scoped OAuth Tokens & Single-Use Approvals', () => {
  process.env.MCP_SIGNING_SECRET = 'ledger_ae_mcp_hmac_signing_secret_998877_secure_32bytes!';
  const mcp = new LedgerMcpServer();
  const TENANT_ID = 'tenant-uae-grp-01';

  // Issue test scoped tokens
  const readToken = McpSecurityService.issueScopedToken({
    userId: 'usr-auditor-01',
    tenantId: TENANT_ID,
    role: 'EXTERNAL_AUDITOR',
    scopes: ['mcp:read']
  });

  const writeProposalToken = McpSecurityService.issueScopedToken({
    userId: 'usr-agent-01',
    tenantId: TENANT_ID,
    role: 'AI_AGENT',
    scopes: ['mcp:read', 'mcp:proposals:write']
  });

  const approverToken = McpSecurityService.issueScopedToken({
    userId: 'usr-cfo-01',
    tenantId: TENANT_ID,
    role: 'CFO',
    scopes: ['mcp:read', 'mcp:approvals:execute']
  });

  test('Lists 4 available MCP tools using official MCP SDK structure', () => {
    const tools = mcp.getAvailableTools();
    assert.equal(tools.length, 4);

    const toolNames = tools.map((t) => t.name);
    assert.ok(toolNames.includes('get_trial_balance_summary'));
    assert.ok(toolNames.includes('query_vat201_summary'));
    assert.ok(toolNames.includes('create_adjustment_proposal'));
    assert.ok(toolNames.includes('execute_approved_proposal'));
  });

  test('Executes read tool with valid scoped bearer token', async () => {
    const response = await mcp.executeTool({
      toolName: 'query_vat201_summary',
      arguments: { taxPeriod: '2026-Q1' },
      bearerToken: readToken
    });

    assert.equal(response.isSuccess, true);
    assert.match(response.content[0].text, /box1StandardRatedAed/);
  });

  test('Security Gate: Rejects request with missing or invalid token signature (No fake prefix checks)', async () => {
    // 1. Missing token
    const resNoToken = await mcp.executeTool({
      toolName: 'query_vat201_summary',
      arguments: { taxPeriod: '2026-Q1' },
      bearerToken: ''
    });
    assert.equal(resNoToken.isSuccess, false);
    assert.match(resNoToken.error!, /SECURITY_VIOLATION: AUTH_ERROR/);

    // 2. Tampered token signature
    const tamperedToken = readToken.slice(0, -6) + 'XXXXXX';
    const resTampered = await mcp.executeTool({
      toolName: 'query_vat201_summary',
      arguments: { taxPeriod: '2026-Q1' },
      bearerToken: tamperedToken
    });
    assert.equal(resTampered.isSuccess, false);
    assert.match(resTampered.error!, /Invalid cryptographic token signature/);
  });

  test('Security Gate: Rejects request when token lacks required scope', async () => {
    // readToken has only ['mcp:read'], attempting to call write tool create_adjustment_proposal
    const response = await mcp.executeTool({
      toolName: 'create_adjustment_proposal',
      arguments: {
        periodId: '2026-01',
        reason: 'Unauthorized write attempt',
        proposedDebitsFils: '1000',
        proposedCreditsFils: '1000'
      },
      bearerToken: readToken
    });

    assert.equal(response.isSuccess, false);
    assert.match(response.error!, /Insufficient scope/);
  });

  test('Write Tool Invariant: create_adjustment_proposal ONLY creates proposals (never directly mutates ledger)', async () => {
    const response = await mcp.executeTool({
      toolName: 'create_adjustment_proposal',
      arguments: {
        periodId: '2026-01',
        reason: 'Quarterly Audit Expense Accrual',
        proposedDebitsFils: '500000',
        proposedCreditsFils: '500000'
      },
      bearerToken: writeProposalToken
    });

    assert.equal(response.isSuccess, true);
    const parsed = JSON.parse(response.content[0].text);
    assert.equal(parsed.status, 'PROPOSAL_CREATED_PENDING_APPROVAL');
    assert.ok(parsed.proposalId.startsWith('prop-'));
    assert.match(parsed.message, /Ledger remains unmutated until an authorized human issues a single-use approval ticket/);
  });

  test('Approvals: Server-issued single-use approval ticket executes proposal and writes audit log', async () => {
    McpSecurityService.resetForTesting();
    const proposalId = 'prop-audit-accrual-99';

    // 1. Issue signed, expiring approval ticket
    const ticket = McpSecurityService.issueApprovalTicket({
      proposalId,
      tenantId: TENANT_ID,
      approverId: 'usr-cfo-01',
      approverRole: 'CFO',
      ttlSeconds: 600 // 10 minutes
    });

    assert.ok(ticket.nonce);
    assert.ok(ticket.signature);
    assert.ok(ticket.expiresAt > Math.floor(Date.now() / 1000));

    // 2. Execute with ticket
    const response = await mcp.executeTool({
      toolName: 'execute_approved_proposal',
      arguments: { proposalId },
      bearerToken: approverToken,
      approvalTicket: ticket
    });

    assert.equal(response.isSuccess, true);
    const parsed = JSON.parse(response.content[0].text);
    assert.equal(parsed.status, 'POSTED');
    assert.equal(parsed.approvedBy, 'usr-cfo-01');
    assert.ok(parsed.auditLogId);

    // 3. REPLAY ATTACK TEST: Attempting to use the SAME ticket again fails (nonce burned)
    const replayResponse = await mcp.executeTool({
      toolName: 'execute_approved_proposal',
      arguments: { proposalId },
      bearerToken: approverToken,
      approvalTicket: ticket
    });

    assert.equal(replayResponse.isSuccess, false);
    assert.match(replayResponse.error!, /Single-use approval ticket was already consumed \(Replay Attack Detected\)/);
  });

  test('Approvals: Rejects tampered ticket or expired ticket', async () => {
    const proposalId = 'prop-security-check';

    // 1. Tampered signature
    const validTicket = McpSecurityService.issueApprovalTicket({
      proposalId,
      tenantId: TENANT_ID,
      approverId: 'usr-cfo-01',
      approverRole: 'CFO'
    });

    const tamperedTicket = { ...validTicket, signature: validTicket.signature.slice(0, -4) + 'abcd' };
    const tamperedRes = await mcp.executeTool({
      toolName: 'execute_approved_proposal',
      arguments: { proposalId },
      bearerToken: approverToken,
      approvalTicket: tamperedTicket
    });
    assert.equal(tamperedRes.isSuccess, false);
    assert.match(tamperedRes.error!, /Tampered approval ticket signature/);

    // 2. Expired ticket
    const expiredTicket = McpSecurityService.issueApprovalTicket({
      proposalId,
      tenantId: TENANT_ID,
      approverId: 'usr-cfo-01',
      approverRole: 'CFO',
      ttlSeconds: -10 // expired in the past
    });
    const expiredRes = await mcp.executeTool({
      toolName: 'execute_approved_proposal',
      arguments: { proposalId },
      bearerToken: approverToken,
      approvalTicket: expiredTicket
    });
    assert.equal(expiredRes.isSuccess, false);
    assert.match(expiredRes.error!, /Approval ticket expired/);
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

  describe('Durable Replay Protection across Restarts (Real Postgres & Migration 0007)', () => {
    const TEST_DATABASE_URL =
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

    test('Single-use approval ticket and nonce burned in database are rejected after full server restart', async () => {
      const { Pool } = await import('pg');
      const testPool = new Pool({ connectionString: TEST_DATABASE_URL });
      const testTenantId = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const testApproverId = '30000000-0000-0000-0000-000000000011';
      const proposalId = `prop-restart-proof-${Date.now()}`;

      // Server Instance 1: Issues and consumes ticket
      const server1 = new LedgerMcpServer(testPool);

      const ticket = McpSecurityService.issueApprovalTicket({
        proposalId,
        tenantId: testTenantId,
        approverId: testApproverId,
        approverRole: 'CFO',
        ttlSeconds: 600
      });

      const clientToken = McpSecurityService.issueScopedToken({
        userId: testApproverId,
        tenantId: testTenantId,
        role: 'CFO',
        scopes: ['mcp:approvals:execute']
      });

      // Execute on Server 1: First usage succeeds and persists burned nonce in DB
      const res1 = await server1.executeTool({
        toolName: 'execute_approved_proposal',
        arguments: { proposalId },
        bearerToken: clientToken,
        approvalTicket: ticket
      });

      assert.equal(res1.isSuccess, true, res1.error || 'Execution failed');
      const parsed1 = JSON.parse(res1.content[0].text);
      assert.equal(parsed1.status, 'POSTED');

      // SIMULATE PROCESS RESTART:
      // Clear all in-memory fallback state and instantiate completely new Server Instance 2
      McpSecurityService.resetForTesting();
      const server2 = new LedgerMcpServer(testPool);

      // Replay Attack against Server Instance 2:
      // Must be rejected by database unique constraint on mcp_burned_nonces
      const replayRes = await server2.executeTool({
        toolName: 'execute_approved_proposal',
        arguments: { proposalId },
        bearerToken: clientToken,
        approvalTicket: ticket
      });

      assert.equal(replayRes.isSuccess, false);
      assert.match(replayRes.error!, /Single-use approval ticket was already consumed \(Replay Attack Detected\)/);

      await testPool.end();
    });
  });
});

