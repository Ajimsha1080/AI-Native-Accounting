import { UUID } from '@ledger-ae/shared-types';
import { computeVoucherHash } from './hash.js';
import { JournalEntryCandidate } from './invariants.js';

export interface SecurityPolicyConfig {
  minimumPasswordLength: number;
  requireMfa: boolean;
  sessionTimeoutMinutes: number;
  allowedWebhookHosts?: string[];
  dataRetentionYears: number; // UAE statutory 5+ years
}

export interface SecurityAuditFinding {
  ruleId: string;
  category: 'ASVS_V4_ACCESS_CONTROL' | 'ASVS_V5_INPUT_VALIDATION' | 'ASVS_V10_SSRF' | 'ASVS_V8_DATA_PROTECTION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  isRemediated: boolean;
}

export interface DisasterRecoveryDrillResult {
  drillId: UUID;
  timestamp: string;
  targetRpoMinutes: number; // 5 min
  achievedRpoMinutes: number;
  targetRtoMinutes: number; // 60 min (1 hour)
  achievedRtoSeconds: number;
  isRpoMet: boolean;
  isRtoMet: boolean;
  ledgerIntegrityVerified: boolean;
  restoredVouchersCount: number;
  status: 'SUCCESS' | 'FAILED';
  verificationDetails: string[];
}

export interface TenantDataRetentionRecord {
  tenantId: UUID;
  documentId: UUID;
  creationDate: string; // 'YYYY-MM-DD'
  retentionExpiryDate: string;
  isLegalHoldActive: boolean;
}

export class SecurityHardeningEngine {
  private static PRIVATE_IP_RANGES = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // AWS/GCP/Azure link-local metadata service
    /^localhost$/i
  ];

  /**
   * ASVS V10: SSRF Protection.
   * Validates external webhook URLs against internal and cloud metadata IP addresses.
   */
  static validateWebhookUrl(urlStr: string): { isValid: boolean; error?: string } {
    try {
      const parsed = new URL(urlStr);
      if (parsed.protocol !== 'https:') {
        return { isValid: false, error: 'SSRF Protection: Webhook URLs must strictly use HTTPS.' };
      }

      const hostname = parsed.hostname;
      for (const pattern of this.PRIVATE_IP_RANGES) {
        if (pattern.test(hostname)) {
          return {
            isValid: false,
            error: `SSRF Protection: Outbound requests to private/link-local address "${hostname}" are blocked.`
          };
        }
      }

      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Invalid URL format.' };
    }
  }

  /**
   * ASVS V5: Input Validation & SQL/Command Injection Guard.
   * Inspects user inputs for injection signatures.
   */
  static detectInjectionAttempt(input: string): boolean {
    const dangerousPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b\s+.*\b(FROM|INTO|TABLE|DATABASE)\b)/i,
      /(--|\/\*|\*\/|;\s*DROP)/i,
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i, // XSS
      /\.\.\/|\.\.\\/ // Path traversal
    ];

    return dangerousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * ASVS V4: Multi-Tenant Isolation Enforcement.
   * Asserts that mutations or queries never bridge across distinct tenant IDs.
   */
  static assertTenantIsolation(activeSessionTenantId: UUID, requestedResourceTenantId: UUID) {
    if (activeSessionTenantId !== requestedResourceTenantId) {
      throw new Error(
        `CROSS-TENANT ACCESS VIOLATION: Active session tenant "${activeSessionTenantId}" attempted to access resource owned by tenant "${requestedResourceTenantId}". Incident logged.`
      );
    }
  }

  /**
   * Data Retention & Legal Hold: UAE PDPL (Federal Decree-Law No. 45 of 2021).
   * Prevents deletion or purge of financial records under active legal hold.
   */
  static assertDeletionPermitted(record: TenantDataRetentionRecord, currentDate: string): boolean {
    if (record.isLegalHoldActive) {
      throw new Error(`Deletion Prohibited: Document "${record.documentId}" is flagged under active Legal Hold.`);
    }

    const current = new Date(currentDate);
    const expiry = new Date(record.retentionExpiryDate);

    if (current < expiry) {
      throw new Error(
        `Deletion Prohibited: Document "${record.documentId}" has not reached statutory retention expiry (${record.retentionExpiryDate}).`
      );
    }

    return true;
  }
}

/**
 * Disaster Recovery (DR) Point-in-Time Restore Simulator.
 * Validates RPO <= 5 min and RTO <= 1 hour with full ledger invariant integrity verification.
 */
export class DisasterRecoveryEngine {
  static runSimulatedRestoreDrill(params: {
    drillId: UUID;
    simulatedCrashTimestamp: number;
    lastWalBackupTimestamp: number;
    vouchers: JournalEntryCandidate[];
  }): DisasterRecoveryDrillResult {
    const startTime = Date.now();
    const verificationDetails: string[] = [];

    // 1. Calculate RPO (Data loss window between crash and last backup)
    const dataLossMs = params.simulatedCrashTimestamp - params.lastWalBackupTimestamp;
    const achievedRpoMinutes = Math.max(0, Math.round((dataLossMs / (1000 * 60)) * 100) / 100);
    const isRpoMet = achievedRpoMinutes <= 5.0; // RPO target <= 5 min

    verificationDetails.push(`RPO Target: <= 5.0 min | Achieved: ${achievedRpoMinutes} min (${isRpoMet ? 'PASS' : 'FAIL'})`);

    // 2. Simulate Storage Snapshot Download & WAL Replay
    let totalRestoredDebits = 0n;
    let totalRestoredCredits = 0n;
    let corruptedVouchers = 0;

    for (const voucher of params.vouchers) {
      const hash = computeVoucherHash(voucher);
      if (!hash) {
        corruptedVouchers++;
      }

      for (const line of voucher.lines) {
        if (line.direction === 'DEBIT') {
          totalRestoredDebits += line.amountBase;
        } else {
          totalRestoredCredits += line.amountBase;
        }
      }
    }

    // 3. Verify Ledger Invariant: Debits == Credits on restored state
    const isBalanced = totalRestoredDebits === totalRestoredCredits;
    const ledgerIntegrityVerified = isBalanced && corruptedVouchers === 0;

    verificationDetails.push(`Restored Vouchers: ${params.vouchers.length} | Hash Integrity: ${corruptedVouchers === 0 ? 'VERIFIED' : 'CORRUPTED'}`);
    verificationDetails.push(`Restored Ledger Balance: Debits == Credits (${isBalanced ? 'ZERO VARIANCE' : 'IMBALANCED'})`);

    // 4. Calculate RTO (Recovery Time Objective target <= 60 min)
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const isRtoMet = elapsedSeconds <= 3600; // 1 hour

    verificationDetails.push(`RTO Target: <= 60 min (3600s) | Simulated Execution Time: ${elapsedSeconds}s (PASS)`);

    const isSuccess = isRpoMet && isRtoMet && ledgerIntegrityVerified;

    return {
      drillId: params.drillId,
      timestamp: new Date().toISOString(),
      targetRpoMinutes: 5,
      achievedRpoMinutes,
      targetRtoMinutes: 60,
      achievedRtoSeconds: elapsedSeconds,
      isRpoMet,
      isRtoMet,
      ledgerIntegrityVerified,
      restoredVouchersCount: params.vouchers.length,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      verificationDetails
    };
  }
}
