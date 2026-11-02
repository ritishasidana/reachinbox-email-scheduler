import type { Worker } from 'bullmq';
import { createEmailWorker } from './email.worker';
import { createNotificationWorker } from './notification.worker';
import { createSearchWorker } from './search.worker';

export async function startWorkers(): Promise<() => Promise<void>> {
  const workers: Worker[] = [createEmailWorker(), createNotificationWorker(), await createSearchWorker()];
  return async () => {
    // close() waits for in-flight jobs to finish -> graceful shutdown without abandoning a send.
    await Promise.all(workers.map((w) => w.close()));
  };
}
