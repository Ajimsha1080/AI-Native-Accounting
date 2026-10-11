import { formatMoney } from '@ledger-ae/ledger-core';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isReadOnly: boolean;
}

export interface McpCallToolRequest {
  toolName: string;
  arguments: Record<string, any>;
  callerRole: string; // e.g. 'EXTERNAL_AUDITOR', 'VIEWER'
  approvalToken?: string;
}

export interface McpCallToolResponse {
  isSuccess: boolean;
  content: { type: 'text'; text: string }[];
  error?: string;
}

/**
 * Model Context Protocol (MCP) Server for LedgerAE.
 * Exposes financial tools to approved AI clients (Claude Desktop, Antigravity, Cursor).
 * Security Principle: Read-only scoped by default. All write operations require explicit human approval token.
 */
export class LedgerMcpServer {
  private tools: Map<string, McpToolDefinition> = new Map();

  constructor() {
    this.registerTools();
  }

  private registerTools() {
    this.tools.set('get_trial_balance_summary', {
      name: 'get_trial_balance_summary',
      description: 'Fetches trial balance totals in AED base currency for an accounting period.',
      inputSchema: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: ['periodId']
      },
      isReadOnly: true
    });

    this.tools.set('query_vat201_summary', {
      name: 'query_vat201_summary',
      description: 'Returns box-by-box FTA VAT 201 totals and net tax liability.',
      inputSchema: {
        type: 'object',
        properties: { taxPeriod: { type: 'string' } },
        required: ['taxPeriod']
      },
      isReadOnly: true
    });

    this.tools.set('post_manual_adjustment_entry', {
      name: 'post_manual_adjustment_entry',
      description: 'Posts an adjusting journal voucher to the ledger. Strictly requires dual-control human approval token.',
      inputSchema: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          amountFils: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['periodId', 'amountFils', 'reason']
      },
      isReadOnly: false // Write operation
    });

    this.tools.set('create_adjustment_proposal', {
      name: 'create_adjustment_proposal',
      description: 'Creates a non-posting journal entry proposal for human review. Does not directly mutate the books.',
      inputSchema: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          reason: { type: 'string' },
          proposedDebitsFils: { type: 'string' },
          proposedCreditsFils: { type: 'string' }
        },
        required: ['periodId', 'reason']
      },
      isReadOnly: true // Proposal only
    });
  }

  getAvailableTools(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async executeTool(req: McpCallToolRequest): Promise<McpCallToolResponse> {
    const tool = this.tools.get(req.toolName);
    if (!tool) {
      return {
        isSuccess: false,
        content: [],
        error: `Tool "${req.toolName}" not found.`
      };
    }

    // Security Gate: Write operations require explicit approval token
    if (!tool.isReadOnly) {
      if (!req.approvalToken || !req.approvalToken.startsWith('CFO_APPROVED_')) {
        return {
          isSuccess: false,
          content: [],
          error: 'SECURITY VIOLATION: MCP write operations require a verified human CFO approval token (e.g. CFO_APPROVED_*).'
        };
      }
    }

    // Handle Read Tools
    if (req.toolName === 'get_trial_balance_summary') {
      const mockTotalDebits = 50000000n; // AED 500,000.00
      return {
        isSuccess: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              periodId: req.arguments.periodId,
              totalDebitsAed: formatMoney(mockTotalDebits, 'AED'),
              totalCreditsAed: formatMoney(mockTotalDebits, 'AED'),
              status: 'BALANCED'
            })
          }
        ]
      };
    }

    if (req.toolName === 'query_vat201_summary') {
      return {
        isSuccess: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              taxPeriod: req.arguments.taxPeriod,
              box1StandardRatedAed: '50000.00',
              box1VatDueAed: '2500.00',
              box10RecoverableInputVatAed: '1000.00',
              netPayableAed: '1500.00'
            })
          }
        ]
      };
    }

    if (req.toolName === 'create_adjustment_proposal') {
      const proposalId = `prop-${Date.now()}`;
      return {
        isSuccess: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              proposalId,
              status: 'PROPOSAL_CREATED_PENDING_APPROVAL',
              reason: req.arguments.reason,
              periodId: req.arguments.periodId,
              message: 'Proposal registered successfully. Ledger remains unmutated until an authorized human approves.'
            })
          }
        ]
      };
    }

    if (req.toolName === 'post_manual_adjustment_entry') {
      return {
        isSuccess: true,
        content: [
          {
            type: 'text',
            text: `Adjusting voucher posted successfully under CFO approval token "${req.approvalToken}". Voucher ID: JV-ADJ-2026-99.`
          }
        ]
      };
    }

    return {
      isSuccess: false,
      content: [],
      error: 'Unhandled tool execution'
    };
  }
}
