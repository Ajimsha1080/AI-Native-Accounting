import { UUID } from '@ledger-ae/shared-types';

export type FirmUserRole = 'FIRM_PARTNER' | 'STAFF_ACCOUNTANT' | 'EXTERNAL_AUDITOR';

export interface ClientFirmProfile {
  clientId: UUID;
  clientName: string;
  trn: string;
  jurisdiction: 'MAINLAND' | 'FREE_ZONE';
  pendingTasksCount: number;
  openPeriodName: string;
  vatFilingStatus: 'NOT_STARTED' | 'READY_FOR_REVIEW' | 'FILED';
  corporateTaxStatus?: 'NOT_STARTED' | 'COMPUTED' | 'FILED';
  isPeriodCloseOverdue?: boolean;
}

export interface FirmStaffUser {
  userId: UUID;
  name: string;
  email: string;
  role: FirmUserRole;
  assignedClientIds: Set<UUID>;
}

export class UnauthorizedClientScopeError extends Error {
  constructor(userId: UUID, clientId: UUID) {
    super(`Access Denied: User "${userId}" is not authorized or assigned to client tenant "${clientId}".`);
    this.name = 'UnauthorizedClientScopeError';
  }
}

/**
 * Multi-Client Portal for Accounting and Auditing Firms.
 * Strictly scopes client tenants so that accounting staff only access their assigned clients,
 * while managing partners maintain portfolio-level oversight.
 */
export class AccountingFirmWorkspace {
  private clients: Map<UUID, ClientFirmProfile> = new Map();
  private users: Map<UUID, FirmStaffUser> = new Map();

  registerClient(client: ClientFirmProfile) {
    this.clients.set(client.clientId, client);
  }

  registerStaffUser(user: {
    userId: UUID;
    name: string;
    email: string;
    role: FirmUserRole;
    assignedClientIds?: UUID[];
  }) {
    this.users.set(user.userId, {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      assignedClientIds: new Set(user.assignedClientIds ?? [])
    });
  }

  assignClientToStaff(userId: UUID, clientId: UUID) {
    const user = this.users.get(userId);
    if (!user) throw new Error(`Staff user "${userId}" not found.`);
    if (!this.clients.has(clientId)) throw new Error(`Client "${clientId}" not found.`);
    user.assignedClientIds.add(clientId);
  }

  /**
   * Retrieves client profile ensuring strict client scoping.
   * Throws UnauthorizedClientScopeError if unauthorized.
   */
  getScopedClientOverview(userId: UUID, clientId: UUID): ClientFirmProfile {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User "${userId}" not found.`);

    // Partners have firm-wide access; Staff & Auditors only access assigned clients
    if (user.role !== 'FIRM_PARTNER') {
      if (!user.assignedClientIds.has(clientId)) {
        throw new UnauthorizedClientScopeError(userId, clientId);
      }
    }

    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error(`Client "${clientId}" not found.`);
    }

    return client;
  }

  /**
   * Returns list of clients scoped to the authenticated firm user.
   */
  listScopedClients(userId: UUID): ClientFirmProfile[] {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User "${userId}" not found.`);

    if (user.role === 'FIRM_PARTNER') {
      return Array.from(this.clients.values());
    }

    return Array.from(this.clients.values()).filter((c) =>
      user.assignedClientIds.has(c.clientId)
    );
  }

  /**
   * Backward-compatible summary method.
   */
  listClientsSummary(): ClientFirmProfile[] {
    return Array.from(this.clients.values());
  }

  getClientOverview(clientId: UUID): ClientFirmProfile | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Aggregate health overview for managing partners.
   */
  getFirmPortfolioHealth() {
    const all = Array.from(this.clients.values());
    const totalClients = all.length;
    const readyForVatReview = all.filter((c) => c.vatFilingStatus === 'READY_FOR_REVIEW').length;
    const overdueClose = all.filter((c) => c.isPeriodCloseOverdue).length;
    const totalPendingTasks = all.reduce((sum, c) => sum + c.pendingTasksCount, 0);

    return {
      totalClients,
      readyForVatReview,
      overdueClose,
      totalPendingTasks,
      activeStaffCount: this.users.size
    };
  }
}
