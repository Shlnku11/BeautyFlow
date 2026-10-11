import { Types } from 'mongoose';
import { Appointment, Customer, Notification, Payment, Settings } from '../db/models';
import { withTransaction } from '../db/transactions';

export class DataRetentionService {
  async run(now = new Date()) {
    const policies = await Settings.find({}).select('businessId privacy.dataRetentionDays').lean().exec();
    let businessesProcessed = 0;
    let customersAnonymized = 0;
    for (const policy of policies) {
      const days = policy.privacy?.dataRetentionDays ?? 730;
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      const candidates = await Customer.aggregate<{ _id: Types.ObjectId }>([
        { $match: { businessId: policy.businessId, isDeleted: false, createdAt: { $lt: cutoff } } },
        { $lookup: { from: 'appointments', let: { customerId: '$_id', businessId: '$businessId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$customerId', '$$customerId'] }, { $eq: ['$businessId', '$$businessId'] }, { $gte: ['$startAt', cutoff] }] } } }, { $limit: 1 }], as: 'recentAppointments' } },
        { $match: { recentAppointments: { $size: 0 } } },
        { $project: { _id: 1 } },
        { $limit: 500 },
      ]).exec();
      if (candidates.length === 0) continue;
      businessesProcessed += 1;
      for (const candidate of candidates) {
        const customerId = candidate._id;
        const appointmentIds = await Appointment.find({ businessId: policy.businessId, customerId }).distinct('_id').exec();
        await withTransaction(async (session) => {
          const updated = await Customer.updateOne({ _id: customerId, businessId: policy.businessId, isDeleted: false, createdAt: { $lt: cutoff } }, {
            $set: { firstName: 'Клиент удалён', phone: 'Данные удалены', phoneNormalized: `retained:${customerId.toString()}`, searchTokens: [], isDeleted: true, deletedAt: now },
            $unset: { lastName: '', email: '', emailNormalized: '', contacts: '', notes: '' },
          }, { session }).exec();
          if (updated.modifiedCount !== 1) return;
          if (appointmentIds.length) {
            await Appointment.updateMany({ businessId: policy.businessId, _id: { $in: appointmentIds } }, { $unset: { contactEmail: '', customerNote: '', internalNote: '', visitNote: '', cancelReason: '' } }, { session }).exec();
            await Notification.updateMany({ businessId: policy.businessId, customerId }, { $set: { status: 'cancelled', 'recipient.name': 'Клиент', lastError: 'DATA_RETENTION', updatedAt: now }, $unset: { 'recipient.email': '', 'recipient.phone': '', templateData: '', lockedUntil: '', lockedBy: '' } }, { session }).exec();
            await Payment.updateMany({ businessId: policy.businessId, appointmentId: { $in: appointmentIds } }, { $unset: { notes: '' } }, { session }).exec();
          }
          customersAnonymized += 1;
        });
      }
    }
    return { businessesProcessed, customersAnonymized };
  }
}
