import { UUID } from '@ledger-ae/shared-types';

export enum CloseTaskCategory {
  BANK_RECONCILIATION = 'BANK_RECONCILIATION',
  AR_SUBLEDGER = 'AR_SUBLEDGER',
  AP_SUBLEDGER = 'AP_SUBLEDGER',
  FIXED_ASSETS_DEPRECIATION = 'FIXED_ASSETS_DEPRECIATION',
  PREPAID_AMORTISATION = 'PREPAID_AMORTISATION',
  VAT_201_RECONCILIATION = 'VAT_201_RECONCILIATION',
  INTERCOMPANY_ELIMINATION = 'INTERCOMPANY_ELIMINATION',
  FINAL_PERIOD_HARD_LOCK = 'FINAL_PERIOD_HARD_LOCK'
}

export enum CloseTaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  AI_VERIFIED = 'AI_VERIFIED', // Anomaly checks and reconciliations passed
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED'
}

export interface CloseTask {
  id: UUID;
  periodId: UUID;
  category: CloseTaskCategory;
  title: string;
  assigneeUserId: UUID;
  status: CloseTaskStatus;
  dependsOnTaskIds: UUID[];
  isAiAutoCompletable: boolean;
  completionNotes?: string;
  completedAt?: string;
}

export class CloseChecklistEngine {
  private tasks = new Map<UUID, CloseTask>();

  addTask(task: CloseTask): void {
    this.tasks.set(task.id, task);
  }

  getTasksForPeriod(periodId: UUID): CloseTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.periodId === periodId);
  }

  canCompleteTask(taskId: UUID): { allowed: boolean; reason?: string } {
    const task = this.tasks.get(taskId);
    if (!task) return { allowed: false, reason: 'Task not found' };

    // Check if dependencies are fulfilled
    for (const depId of task.dependsOnTaskIds) {
      const depTask = this.tasks.get(depId);
      if (!depTask || (depTask.status !== CloseTaskStatus.COMPLETED && depTask.status !== CloseTaskStatus.AI_VERIFIED)) {
        return {
          allowed: false,
          reason: `Prerequisite task "${depTask?.title ?? depId}" is not yet completed.`
        };
      }
    }

    return { allowed: true };
  }

  completeTask(taskId: UUID, notes?: string): CloseTask {
    const check = this.canCompleteTask(taskId);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const task = this.tasks.get(taskId)!;
    task.status = CloseTaskStatus.COMPLETED;
    task.completionNotes = notes;
    task.completedAt = new Date().toISOString();
    return task;
  }

  isPeriodReadyForClose(periodId: UUID): boolean {
    const periodTasks = this.getTasksForPeriod(periodId);
    if (periodTasks.length === 0) return false;
    return periodTasks.every((t) => t.status === CloseTaskStatus.COMPLETED || t.status === CloseTaskStatus.AI_VERIFIED);
  }
}
