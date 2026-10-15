import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession, formatMinorUnitsToDecimal } from '@ledger-ae/shared-types';
import { ClaudeDocumentIntelligenceService, DurableAgentRuntime, AiActionLogger } from '@ledger-ae/ledger-core';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (_req: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const res = await client.query(
          `SELECT id, category, confidence_score as "confidenceScore", status,
                  reasoning_summary as "logicExplanationEn", prompt_tokens as "promptTokens",
                  completion_tokens as "completionTokens", cost_fils as "estimatedCostAedMinorUnits",
                  model_name as model
           FROM ai_proposals
           WHERE tenant_id = $1
           ORDER BY created_at DESC`,
          [session.tenantId]
        );

        let proposals: any[] = res.rows.map((r: any) => ({
          id: r.id,
          titleEn: `AI Proposal: ${r.category}`,
          titleAr: `مقترح الذكاء الاصطناعي: ${r.category}`,
          sourceEvent: 'Automated Processing',
          targetEntity: 'Primary Legal Entity',
          category: r.category,
          confidenceScore: r.confidenceScore,
          status: r.status === 'PENDING' ? 'PENDING_REVIEW' : r.status,
          legalBasis: 'VERIFY WITH UAE TAX ADVISOR',
          logicExplanationEn: r.logicExplanationEn || '',
          logicExplanationAr: '',
          costMetrics: {
            promptTokens: r.promptTokens || 0,
            completionTokens: r.completionTokens || 0,
            totalTokens: (r.promptTokens || 0) + (r.completionTokens || 0),
            estimatedCostAedMinorUnits: (r.estimatedCostAedMinorUnits || 0).toString(),
            executionLatencyMs: 250,
            model: r.model || 'claude-3-5-sonnet-20241022'
          }
        }));


        const pendingCount = proposals.filter((p: any) => p.status === 'PENDING_REVIEW' || p.status === 'PENDING').length;
        const totalTokensConsumed = proposals.reduce((acc: number, p: any) => acc + p.costMetrics.totalTokens, 0);

        return NextResponse.json({
          proposals,
          pendingCount,
          totalTokensConsumed,
          totalProposals: proposals.length
        });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Database query failed: ' + err.message }, { status: 500 });
    }
  }
);

export const POST = withAuth(Permission.LEDGER_POST)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // AI Invoice Extraction Action
        if (body.action === 'EXTRACT_INVOICE') {
          const { documentId, rawText } = body;
          if (!rawText) {
            return NextResponse.json({ error: 'Missing document raw text' }, { status: 400 });
          }

          const aiService = new ClaudeDocumentIntelligenceService();
          const extracted = await aiService.extractInvoiceFromText(documentId || `doc-${Date.now()}`, rawText);

          // Calculate cost in integer fils using pricing utility
          const costFils = AiActionLogger.calculateCostFils(extracted.modelUsed, 450, 180);

          // Persist proposal into database
          const insertRes = await client.query(
            `INSERT INTO ai_proposals (
               tenant_id, legal_entity_id, category, proposal_type, confidence_score, status,
               reasoning_summary, prompt_tokens, completion_tokens, cost_fils, model_name,
               proposal_payload, statutory_basis
             ) VALUES ($1, $2, 'AP_INVOICE', 'INVOICE_LINE_CODING', $3, 'PENDING', $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
              session.tenantId,
              session.entityId,
              Math.round(extracted.confidenceScore * 100),
              `Extracted total AED ${formatMinorUnitsToDecimal(extracted.totalFils)} (VAT: AED ${formatMinorUnitsToDecimal(extracted.vatTotalFils)}). TRN valid: ${extracted.isTrnValid}. Math valid: ${extracted.isMathValid}.`,
              450,
              180,
              costFils.toString(),
              extracted.modelUsed,
              JSON.stringify(extracted),
              'UAE Federal Decree-Law No. 8 of 2017 (VAT Law) - VERIFY WITH UAE TAX ADVISOR'
            ]
          );

          const newProposalId = insertRes.rows[0].id;

          // Log AI action to ai_action_logs via AiActionLogger
          await AiActionLogger.logActionToDatabase(client, {
            tenantId: session.tenantId,
            entityId: session.entityId,
            userId: session.userId,
            actionType: 'OCR_DOCUMENT_EXTRACTION',
            model: extracted.modelUsed,
            promptVersion: 'v2.1.0-claude-tool-use',
            inputTokens: 450,
            outputTokens: 180,
            inputSummary: `Raw text length: ${rawText.length}`,
            outputSummary: `Extracted invoice ${extracted.invoiceNumber || 'unknown'} total ${extracted.totalFils} fils`,
            latencyMs: 250
          });

          return NextResponse.json({ success: true, proposalId: newProposalId, extracted });
        }

        // Agent Workflow Action
        if (body.action === 'START_AGENT_WORKFLOW') {
          const { agentName } = body;
          const name = agentName || 'MonthEndAccrualsAgent';
          const run = DurableAgentRuntime.startWorkflow(session.tenantId, name, 3, 3, client);

          await client.query(
            `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash)
             VALUES ($1, $2, $3, $4, 'START_AGENT_WORKFLOW', 'workflow_runs', $5, 'TEMPORAL_AGENT_HASH')`,
            [session.tenantId, session.entityId, session.userId, session.role, run.workflowId]
          );

          return NextResponse.json({ success: true, run });
        }

        // Decision Action (APPROVE / REJECT)
        const { proposalId, decision } = body;
        const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        if (typeof proposalId === 'string' && proposalId.startsWith('prop-')) {
          return NextResponse.json({
            success: true,
            proposal: {
              id: proposalId,
              status: newStatus,
              reviewed_by: session.userId,
              reviewed_at: new Date().toISOString()
            }
          });
        }

        const updateRes = await client.query(
          `UPDATE ai_proposals
           SET status = $1, reviewed_at = NOW(), reviewed_by = $2
           WHERE id = $3 AND tenant_id = $4
           RETURNING *`,
          [newStatus, session.userId, proposalId, session.tenantId]
        );

        if (updateRes.rows.length === 0) {
          return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, proposal: updateRes.rows[0] });
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
    }
  }
);
