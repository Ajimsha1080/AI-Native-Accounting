import { UUID } from '@ledger-ae/shared-types';

export enum PeriodLockStatus {
  OPEN = 'OPEN',
  SOFT_LOCKED = 'SOFT_LOCKED', // Warnings on entry creation, requires controller acknowledgement
  HARD_LOCKED = 'HARD_LOCKED'  // Strictly rejected at engine and database level
}

export interface AccountingPeriodState {
  periodId: UUID;
  entityId: UUID;
  fiscalYear: number;
  periodNumber: number; // 1 - 12
  startDate: string;    // 'YYYY-MM-DD'
  endDate: string;      // 'YYYY-MM-DD'
  status: PeriodLockStatus;
  lockedAt?: string;
  lockedBy?: UUID;
  reopenReason?: string;
}

export class PeriodLockedException extends Error {
  constructor(public periodId: UUID, public status: PeriodLockStatus, message?: string) {
    super(message || `Accounting period ${periodId} is ${status}. New postings are forbidden.`);
    this.name = 'PeriodLockedException';
  }
}

export class PeriodManager {
  private periods = new Map<UUID, AccountingPeriodState>();

  registerPeriod(period: AccountingPeriodState): void {
    this.periods.set(period.periodId, period);
  }

  getPeriod(periodId: UUID): AccountingPeriodState | undefined {
    return this.periods.get(periodId);
  }

  lockPeriod(periodId: UUID, lockedBy: UUID, hardLock: boolean = true): AccountingPeriodState {
    const period = this.periods.get(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} not found`);
    }

    period.status = hardLock ? PeriodLockStatus.HARD_LOCKED : PeriodLockStatus.SOFT_LOCKED;
    period.lockedAt = new Date().toISOString();
    period.lockedBy = lockedBy;
    return period;
  }

  reopenPeriod(periodId: UUID, reopenedBy: UUID, reason: string): AccountingPeriodState {
    const period = this.periods.get(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} not found`);
    }
    if (!reason || reason.trim().length < 10) {
      throw new Error('Mandatory audit justification (> 10 chars) required to reopen a locked accounting period.');
    }

    period.status = PeriodLockStatus.OPEN;
    period.reopenReason = reason;
    return period;
  }

  assertPostingPermitted(periodId: UUID): void {
    const period = this.periods.get(periodId);
    if (!period) {
      throw new Error(`Accounting period ${periodId} does not exist.`);
    }

    if (period.status === PeriodLockStatus.HARD_LOCKED) {
      throw new PeriodLockedException(periodId, PeriodLockStatus.HARD_LOCKED);
    }
  }
}
