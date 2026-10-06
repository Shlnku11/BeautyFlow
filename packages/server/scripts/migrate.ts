import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { connectToDatabase, disconnectFromDatabase } from '@/server/db/connection';
import { logger } from '@/server/http/logger';
import { up as initializeIndexes, migrationId } from '../migrations/000_init';
import { up as addGoogleIdentityIndex, migrationId as googleIdentityMigrationId } from '../migrations/001_google_identity';

async function runMigrations(): Promise<void> {
  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection has no database handle');

  const collection = db.collection('schemaMigrations');
  await collection.createIndex({ id: 1 }, { unique: true });
  const migrations = [
    { id: migrationId, filename: '000_init.ts', up: initializeIndexes },
    { id: googleIdentityMigrationId, filename: '001_google_identity.ts', up: addGoogleIdentityIndex },
  ];
  for (const migration of migrations) {
    const migrationPath = fileURLToPath(new URL(`../migrations/${migration.filename}`, import.meta.url));
    const checksum = createHash('sha256').update(await readFile(migrationPath)).digest('hex');
    const existing = await collection.findOne<{ checksum: string }>({ id: migration.id });
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Контрольная сумма применённой миграции ${migration.id} изменилась`);
      logger.info({ migrationId: migration.id }, 'migration already applied');
      continue;
    }
    await migration.up(db);
    await collection.insertOne({ id: migration.id, appliedAt: new Date(), checksum });
    logger.info({ migrationId: migration.id }, 'migration applied');
  }
}

runMigrations()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
