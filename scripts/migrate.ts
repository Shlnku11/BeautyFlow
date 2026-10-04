import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { connectToDatabase, disconnectFromDatabase } from '@/server/db/connection';
import { logger } from '@/server/http/logger';
import { up as initializeIndexes, migrationId } from '../migrations/000_init';

async function runMigrations(): Promise<void> {
  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection has no database handle');

  const collection = db.collection('schemaMigrations');
  await collection.createIndex({ id: 1 }, { unique: true });
  const migrationPath = fileURLToPath(new URL('../migrations/000_init.ts', import.meta.url));
  const source = await readFile(migrationPath);
  const checksum = createHash('sha256').update(source).digest('hex');
  const existing = await collection.findOne<{ checksum: string }>({ id: migrationId });

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error(`Контрольная сумма применённой миграции ${migrationId} изменилась`);
    }
    logger.info({ migrationId }, 'migration already applied');
    return;
  }

  await initializeIndexes(db);
  await collection.insertOne({ id: migrationId, appliedAt: new Date(), checksum });
  logger.info({ migrationId }, 'migration applied');
}

runMigrations()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
