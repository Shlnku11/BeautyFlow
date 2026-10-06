export type DedupeKeyInput =
  | { channel: 'email' | 'sms' | 'push'; kind: 'appointment_confirmed' | 'appointment_changed' | 'appointment_cancelled'; appointmentId: string; version: number }
  | { channel: 'email' | 'sms' | 'push'; kind: 'reminder_24h' | 'reminder_1h'; appointmentId: string; startAt: Date }
  | { channel: 'email' | 'sms' | 'push'; kind: 'followup_after_visit'; appointmentId: string }
  | { channel: 'email' | 'sms' | 'push'; kind: 'staff_invite'; memberId: string; tokenHash: string }
  | { channel: 'email' | 'sms' | 'push'; kind: 'password_reset'; userId: string; tokenHash: string }
  | { channel: 'email'; kind: 'email_verification'; userId: string; tokenHash: string };

export function buildDedupeKey(input: DedupeKeyInput): string {
  switch (input.kind) {
    case 'appointment_confirmed':
    case 'appointment_changed':
    case 'appointment_cancelled':
      return `${input.channel}:${input.kind}:${input.appointmentId}:${input.version}`;
    case 'reminder_24h':
    case 'reminder_1h':
      return `${input.channel}:${input.kind}:${input.appointmentId}:${input.startAt.getTime()}`;
    case 'followup_after_visit':
      return `${input.channel}:followup_after_visit:${input.appointmentId}`;
    case 'staff_invite':
      return `${input.channel}:staff_invite:${input.memberId}:${input.tokenHash.slice(0, 8)}`;
    case 'password_reset':
      return `${input.channel}:password_reset:${input.userId}:${input.tokenHash.slice(0, 8)}`;
    case 'email_verification':
      return `${input.channel}:email_verification:${input.userId}:${input.tokenHash.slice(0, 8)}`;
  }
}
