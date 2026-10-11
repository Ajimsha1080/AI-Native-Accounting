import { Worker, NativeConnection } from '@temporalio/worker';
import { createActivities, Activities } from './activities.js';
import { DEFAULT_TASK_QUEUE } from './client.js';

export { DEFAULT_TASK_QUEUE };

export interface TemporalWorkerConfig {
  connection?: NativeConnection;
  taskQueue?: string;
  activities?: Partial<Activities>;
}

export interface TemporalWorkerOptions extends TemporalWorkerConfig {}

/**
 * Creates and initializes a Temporal Worker with all accounting workflow definitions.
 * Intended for standalone background worker processes, never imported into Next.js frontend bundles.
 */
export async function createAccountingTemporalWorker(
  config: TemporalWorkerOptions = {}
): Promise<Worker> {
  const activities = {
    ...createActivities(),
    ...(config.activities || {})
  };

  const worker = await Worker.create({
    connection: config.connection,
    namespace: 'default',
    taskQueue: config.taskQueue || DEFAULT_TASK_QUEUE,
    workflowsPath: require.resolve('./workflows.js'),
    activities
  });

  return worker;
}
