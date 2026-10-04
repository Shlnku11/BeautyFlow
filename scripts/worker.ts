import { disconnectFromDatabase } from '@/server/db/connection';
import { logger } from '@/server/http/logger';

async function main(): Promise<void> {
  logger.warn(
    { stage: 1 },
    'Notification batch processing is added in stage 8; this entry point currently verifies configuration only.',
  );
  await disconnectFromDatabase();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'worker bootstrap failed');
  process.exitCode = 1;
});
