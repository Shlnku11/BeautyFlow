import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

import { createModelSchema, registerModel } from './common';

export const AUDIT_ACTOR_ROLES = ['owner', 'admin', 'master', 'system', 'customer'] as const;
export const AUDIT_ACTIONS = [
  'member.invited',
  'member.role_changed',
  'member.disabled',
  'ownership.transferred',
  'staff.deactivated',
  'service.deleted',
  'customer.deleted',
  'payment.created',
  'payment.refunded',
  'payment.cancelled',
  'appointment.cancelled',
  'settings.updated',
  'auth.login_failed_limit',
  'auth.password_changed',
  'shift.started',
  'shift.closed',
  'request.mutated',
  'request.activity',
  'account.profile_updated',
] as const;

export interface AuditLogDocument {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  actorUserId?: Types.ObjectId | null;
  actorRole: (typeof AUDIT_ACTOR_ROLES)[number];
  action: (typeof AUDIT_ACTIONS)[number];
  entityType: string;
  entityId: Types.ObjectId | string;
  metadata?: unknown;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = createModelSchema<AuditLogDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, immutable: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    actorRole: { type: String, enum: AUDIT_ACTOR_ROLES, required: true, immutable: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, immutable: true },
    entityType: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
    entityId: { type: Schema.Types.Mixed, required: true, immutable: true },
    metadata: { type: Schema.Types.Mixed, immutable: true },
    ip: { type: String, trim: true, maxlength: 64, immutable: true },
  },
  { tenant: true },
);

schema.pre('save', function immutableExistingAuditEntry() {
  if (!this.isNew) throw new Error('Audit log entries are append-only');
});

export const AuditLog = registerModel<AuditLogDocument>('AuditLog', 'auditLogs', schema);
