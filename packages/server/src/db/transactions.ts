import type { ClientSession } from 'mongoose';

import { connectToDatabase } from '@/server/db/connection';

const MAX_TRANSACTION_ATTEMPTS = 4;

function isTransientTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('hasErrorLabel' in error)) return false;
  const hasErrorLabel = error.hasErrorLabel;
  return (
    typeof hasErrorLabel === 'function' &&
    hasErrorLabel.call(error, 'TransientTransactionError') === true
  );
}

/** Run database-only work atomically, retrying transient conflicts at most three times. */
export async function withTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const mongoose = await connectToDatabase();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
        writeConcern: { w: 'majority' },
      });

      const result = await operation(session);
      await session.commitTransaction();
      return result;
    } catch (error: unknown) {
      lastError = error;
      if (session.inTransaction()) {
        await session.abortTransaction().catch(() => undefined);
      }
      if (attempt === MAX_TRANSACTION_ATTEMPTS || !isTransientTransactionError(error)) {
        throw error;
      }
    } finally {
      await session.endSession();
    }
  }

  throw lastError;
}
