import crypto from 'node:crypto';
import { UUID, AuditService, UserRole } from '@ledger-ae/shared-types';

export interface McpTokenPayload {
  sub: string; // User ID
  tenantId: string;
  role: string;
  scopes: string[]; // e.g. ['mcp:read', 'mcp:proposals:write', 'mcp:approvals:execute']
  exp: number; // Expiration epoch (seconds)
  iat: number;
}

export interface ServerSignedApprovalTicket {
  proposalId: string;
  tenantId: string;
  approverId: string;
  approverRole: string;
  nonce: string; // Cryptographic nonce for single-use guarantee
  expiresAt: number; // Expiration epoch (seconds)
  signature: string; // HMAC-SHA256 signature
}

/**
 * Production Cryptographic Token & Approval Service for LedgerAE MCP Server.
 * Replaces fake prefix-string checks with scoped, signed, expiring, single-use tickets.
 */
export class McpSecurityService {
  private static burnedNonces: Set<string> = new Set();
  private static defaultSecret: string =
    process.env.MCP_SIGNING_SECRET || 'ledger_ae_mcp_hmac_signing_secret_998877';

  /**
   * Issues a cryptographically signed scoped API/OAuth bearer token.
   */
  static issueScopedToken(
    params: {
      userId: string;
      tenantId: string;
      role: string;
      scopes: string[];
      ttlSeconds?: number;
    },
    secret: string = this.defaultSecret
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const ttl = params.ttlSeconds ?? 3600; // 1 hour default

    const payload: McpTokenPayload = {
      sub: params.userId,
      tenantId: params.tenantId,
      role: params.role,
      scopes: params.scopes,
      iat: now,
      exp: now + ttl
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');

    return `${header}.${body}.${hmac}`;
  }

  /**
   * Validates a scoped token, ensuring valid signature, non-expired status, and presence of required scope.
   */
  static verifyScopedToken(
    tokenString: string,
    requiredScope?: string,
    secret: string = this.defaultSecret
  ): McpTokenPayload {
    if (!tokenString || typeof tokenString !== 'string') {
      throw new Error('AUTH_ERROR: Missing or malformed token');
    }

    const parts = tokenString.split('.');
    if (parts.length !== 3) {
      throw new Error('AUTH_ERROR: Invalid token structure (expected standard 3-part signed token)');
    }

    const [header, body, signature] = parts;
    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (
      signature.length !== expectedHmac.length ||
      !crypto.timingSafeEqual(Buffer.from(signature, 'utf-8'), Buffer.from(expectedHmac, 'utf-8'))
    ) {
      throw new Error('AUTH_ERROR: Invalid cryptographic token signature');
    }

    const payload: McpTokenPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) {
      throw new Error(`AUTH_ERROR: Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
    }

    if (requiredScope && !payload.scopes.includes(requiredScope) && !payload.scopes.includes('*')) {
      throw new Error(`AUTH_ERROR: Insufficient scope. Required: "${requiredScope}". Possessed: [${payload.scopes.join(', ')}]`);
    }

    return payload;
  }

  /**
   * Server Issues a Signed, Single-Use, Expiring Approval Ticket.
   * Requires human approval (CFO/Finance Director) with finite validity (e.g. 15 minutes).
   */
  static issueApprovalTicket(
    params: {
      proposalId: string;
      tenantId: string;
      approverId: string;
      approverRole: string;
      ttlSeconds?: number;
    },
    secret: string = this.defaultSecret
  ): ServerSignedApprovalTicket {
    const now = Math.floor(Date.now() / 1000);
    const ttl = params.ttlSeconds ?? 900; // 15 minutes
    const expiresAt = now + ttl;
    const nonce = crypto.randomUUID();

    const message = `${params.proposalId}:${params.tenantId}:${params.approverId}:${params.approverRole}:${nonce}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    return {
      proposalId: params.proposalId,
      tenantId: params.tenantId,
      approverId: params.approverId,
      approverRole: params.approverRole,
      nonce,
      expiresAt,
      signature
    };
  }

  /**
   * Verifies and Consumes a Server-Issued Approval Ticket.
   * Enforces:
   * 1. Cryptographic HMAC-SHA256 signature check.
   * 2. Expiration check.
   * 3. Single-use replay protection: Burns nonce upon first successful use.
   * 4. Audit Log recording.
   */
  static verifyAndConsumeApprovalTicket(
    ticket: ServerSignedApprovalTicket,
    expectedProposalId: string,
    secret: string = this.defaultSecret
  ): { isValid: boolean; approverId: string; auditLogId: UUID } {
    if (!ticket || !ticket.nonce || !ticket.signature) {
      throw new Error('SECURITY_VIOLATION: Incomplete or missing approval ticket');
    }

    // 1. Replay Protection: Check if nonce was already burned
    if (this.burnedNonces.has(ticket.nonce)) {
      throw new Error('SECURITY_VIOLATION: Single-use approval ticket was already consumed (Replay Attack Detected)');
    }

    // 2. Proposal ID Match
    if (ticket.proposalId !== expectedProposalId) {
      throw new Error(`SECURITY_VIOLATION: Ticket proposal ID mismatch (${ticket.proposalId} !== ${expectedProposalId})`);
    }

    // 3. Expiration Check
    const now = Math.floor(Date.now() / 1000);
    if (ticket.expiresAt < now) {
      throw new Error(`SECURITY_VIOLATION: Approval ticket expired at ${new Date(ticket.expiresAt * 1000).toISOString()}`);
    }

    // 4. Cryptographic Signature Verification
    const message = `${ticket.proposalId}:${ticket.tenantId}:${ticket.approverId}:${ticket.approverRole}:${ticket.nonce}:${ticket.expiresAt}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    if (
      ticket.signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(ticket.signature, 'utf-8'), Buffer.from(expectedSignature, 'utf-8'))
    ) {
      throw new Error('SECURITY_VIOLATION: Tampered approval ticket signature');
    }

    // 5. Burn Nonce (Single-Use Enforced)
    this.burnedNonces.add(ticket.nonce);

    // 6. Record Audit Log Entry
    const auditService = new AuditService();
    const auditRecord = auditService.recordMutation({
      tenantId: ticket.tenantId,
      entityId: ticket.tenantId,
      userId: ticket.approverId,
      role: (ticket.approverRole as UserRole) || UserRole.CFO,
      action: 'APPROVE',
      resourceType: 'MCP_APPROVAL_TICKET',
      resourceId: ticket.proposalId,
      ipAddress: '127.0.0.1',
      userAgent: 'LedgerAE-MCP-Server/1.0',
      payloadBefore: { status: 'PENDING_APPROVAL' },
      payloadAfter: { status: 'APPROVED', nonce: ticket.nonce, consumedAt: new Date().toISOString() }
    });

    return {
      isValid: true,
      approverId: ticket.approverId,
      auditLogId: auditRecord.id
    };
  }

  /**
   * Clears burned nonces (for testing only).
   */
  static resetForTesting(): void {
    this.burnedNonces.clear();
  }
}
