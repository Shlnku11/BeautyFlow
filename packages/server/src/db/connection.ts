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
    const connectionUri =
      env.NODE_ENV === 'test' && env.TEST_MONGODB_URI ? env.TEST_MONGODB_URI : env.MONGODB_URI;
    cache.promise = mongoose
      .connect(connectionUri, {
        dbName: env.MONGODB_DB_NAME,
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
