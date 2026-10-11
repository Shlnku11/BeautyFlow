import mongoose from 'mongoose';

import { getEnv } from '@/server/config/env';

declare global {
  // Preserve the single pooled connection across development module reloads.
  var __nextAppointmentsMongoose: {
    connection: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}

const cache = (globalThis.__nextAppointmentsMongoose ??= {
  connection: null,
  promise: null,
});

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.connection?.connection.readyState === 1) return cache.connection;

  if (!cache.promise) {
    const env = getEnv();
    // Test suites start an isolated MongoDB replica set in beforeAll and update
    // process.env after importing services. Read the connection target at the
    // moment the first connection is created instead of reusing a cached env value.
    const currentTestUri = process.env.NODE_ENV === 'test' ? process.env.TEST_MONGODB_URI : undefined;
    const connectionUri = currentTestUri?.trim() || process.env.MONGODB_URI || env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME?.trim() || env.MONGODB_DB_NAME;
    cache.promise = mongoose
      .connect(connectionUri, {
        dbName,
        maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
        autoIndex: false,
        serverSelectionTimeoutMS: 10_000,
      })
      .then((connection) => {
        cache.connection = connection;
        return connection;
      })
      .catch((error: unknown) => {
        cache.promise = null;
        throw error;
      });
  }

  return cache.promise;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.connection) {
    await cache.connection.disconnect();
    cache.connection = null;
    cache.promise = null;
  }
}
