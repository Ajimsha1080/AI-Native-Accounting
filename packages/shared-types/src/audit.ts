import { createHash } from 'node:crypto';
import { UUID, UserRole, AuditLogEntry } from './index.js';

export interface CreateAuditLogParams {
  tenantId: UUID;
  entityId: UUID;
  userId: UUID;
  role: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  aiAgentMetadata?: {
    isAiInitiated: boolean;
    agentName?: string;
    modelUsed?: string;
    promptVersion?: string;
    confidenceScore?: number;
  };
}

export class AuditService {
  private inMemoryAuditLogs: AuditLogEntry[] = [];

  /**
   * Computes deterministic SHA-256 diff hash for non-repudiation
   */
  static computeDiffHash(before: unknown, after: unknown): string {
    const serialized = JSON.stringify({ before: before ?? null, after: after ?? null });
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Records an immutable audit log entry for every state mutation
   */
  recordMutation(params: CreateAuditLogParams): AuditLogEntry {
    const diffHash = AuditService.computeDiffHash(params.payloadBefore, params.payloadAfter);

    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId: params.tenantId,
      entityId: params.entityId,
      userId: params.userId,
      role: params.role,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      payloadBefore: params.payloadBefore,
      payloadAfter: params.payloadAfter,
      diffHash,
      aiAgentMetadata: params.aiAgentMetadata,
      createdAt: new Date().toISOString()
    };

    this.inMemoryAuditLogs.push(entry);
    return entry;
  }

  getAuditTrailForResource(resourceType: string, resourceId: string): AuditLogEntry[] {
    return this.inMemoryAuditLogs.filter(
      (log) => log.resourceType === resourceType && log.resourceId === resourceId
    );
  }

  getAllLogs(): AuditLogEntry[] {
    return [...this.inMemoryAuditLogs];
  }
}
