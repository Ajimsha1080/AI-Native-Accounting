import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AuditService } from './audit.js';
import { UserRole } from './index.js';

describe('Audit Logging & Mutation Evidence Trail', () => {
  const audit = new AuditService();

  test('Records immutable audit log with before/after state diff and deterministic SHA-256 hash', () => {
    const beforeState = { status: 'DRAFT', amount: 50000 };
    const afterState = { status: 'POSTED', amount: 50000 };

    const entry = audit.recordMutation({
      tenantId: 'ten-uae-falcon-001',
      entityId: 'ent-mainland-01',
      userId: 'usr-cfo-01',
      role: UserRole.CFO,
      action: 'JOURNAL_POST',
      resourceType: 'JOURNAL_ENTRY',
      resourceId: 'JV-2026-0001',
      ipAddress: '185.193.64.12', // UAE IP
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      payloadBefore: beforeState,
      payloadAfter: afterState,
      aiAgentMetadata: {
        isAiInitiated: false
      }
    });

    assert.ok(entry.id);
    assert.equal(entry.action, 'JOURNAL_POST');
    assert.equal(entry.resourceId, 'JV-2026-0001');
    assert.equal(entry.role, UserRole.CFO);

    // Verify SHA-256 diff hash
    const expectedHash = AuditService.computeDiffHash(beforeState, afterState);
    assert.equal(entry.diffHash, expectedHash);

    // Query audit trail by resource
    const trail = audit.getAuditTrailForResource('JOURNAL_ENTRY', 'JV-2026-0001');
    assert.equal(trail.length, 1);
    assert.equal(trail[0].diffHash, expectedHash);
  });
});
