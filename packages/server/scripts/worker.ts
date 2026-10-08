import { randomUUID } from 'node:crypto';
import { connectToDatabase, disconnectFromDatabase } from '@/server/db/connection';
import { getEnv } from '@/server/config/env';
import { logger } from '@/server/http/logger';
import { runNotificationBatch } from '@/server/notifications/run-batch';

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const env = getEnv();
  await connectToDatabase();
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  logger.info({ pollIntervalSeconds: env.WORKER_POLL_INTERVAL_SECONDS, batchLimit: env.WORKER_BATCH_LIMIT }, 'notification worker started');
  try {
    while (!stopping) {
      const now = new Date();
      try {
        const summary = await runNotificationBatch({ limit: env.WORKER_BATCH_LIMIT, now, workerId: randomUUID() });
        if (summary.claimed > 0) logger.info(summary, 'notification batch completed');
      } catch (error: unknown) {
        logger.error({ err: error }, 'notification batch failed');
      }
      if (!stopping) await pause(env.WORKER_POLL_INTERVAL_SECONDS * 1000);
    }
  } finally {
    await disconnectFromDatabase();
    logger.info('notification worker stopped');
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'worker bootstrap failed');
  process.exitCode = 1;
});
