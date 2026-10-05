import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '@/shared/types/tenant-context';
import { Transaction } from '../db/models';
import type { TransactionDocument } from '../db/models/transactions';

export type TransactionInput = Omit<TransactionDocument, '_id' | 'businessId' | 'createdAt' | 'updatedAt'>;

export class TransactionRepository {
  create(ctx: TenantContext, input: TransactionInput, session: ClientSession) {
    return new Transaction({ businessId: new Types.ObjectId(ctx.businessId), ...input }).save({ session });
  }

  countForPayment(ctx: TenantContext, paymentId: string) {
    return Transaction.countDocuments({ businessId: new Types.ObjectId(ctx.businessId), paymentId: new Types.ObjectId(paymentId) }).exec();
  }
}
