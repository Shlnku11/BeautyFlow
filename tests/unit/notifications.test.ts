import { describe, expect, it } from 'vitest';
import { buildDedupeKey } from '../../packages/server/src/notifications/dedupe-key';
import { retryDelayMs } from '../../packages/server/src/notifications/backoff';
import { renderRuTemplate } from '../../packages/server/src/notifications/templates/ru';
import { SmsProvider } from '../../packages/server/src/notifications/providers/sms-provider';
import { PushProvider } from '../../packages/server/src/notifications/providers/push-provider';

describe('notification primitives', () => {
  it('builds dedupe keys according to NOTIFICATIONS_SPEC §5', () => {
    expect(buildDedupeKey({ channel: 'email', kind: 'appointment_confirmed', appointmentId: 'apt-1', version: 3 })).toBe('email:appointment_confirmed:apt-1:3');
    expect(buildDedupeKey({ channel: 'email', kind: 'reminder_24h', appointmentId: 'apt-1', startAt: new Date(1000) })).toBe('email:reminder_24h:apt-1:1000');
    expect(buildDedupeKey({ channel: 'email', kind: 'followup_after_visit', appointmentId: 'apt-1' })).toBe('email:followup_after_visit:apt-1');
    expect(buildDedupeKey({ channel: 'email', kind: 'staff_invite', memberId: 'member-1', tokenHash: 'abcdef012345' })).toBe('email:staff_invite:member-1:abcdef01');
    expect(buildDedupeKey({ channel: 'email', kind: 'password_reset', userId: 'user-1', tokenHash: '12345678abcd' })).toBe('email:password_reset:user-1:12345678');
  });

  it('uses the specified bounded retry schedule', () => {
    expect([1, 2, 3, 4, 5, 7].map(retryDelayMs)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, 43_200_000]);
    expect(() => retryDelayMs(0)).toThrow(RangeError);
  });

  it('renders Russian appointment templates in the business timezone and escapes inserted content', () => {
    const rendered = renderRuTemplate('appointment_confirmed', {
      businessName: '<Salon>', customerName: 'A&B', serviceName: 'Cut <short>', staffName: 'Stylist',
      timezone: 'Asia/Bishkek', startAt: '2026-10-04T04:00:00.000Z', manageUrl: 'https://example.test/manage/token',
    });
    expect(rendered.text).toContain('Asia/Bishkek');
    expect(rendered.text).toContain('10:00');
    expect(rendered.html).toContain('&lt;Salon&gt;');
    expect(rendered.html).toContain('A&amp;B');
    expect(rendered.html).not.toContain('<Salon>');
  });

  it('keeps management links off reminders and provides the business phone instructions', () => {
    const reminder = renderRuTemplate('reminder_1h', {
      businessName: 'Salon', businessPhone: '+996 555 123456', manageUrl: 'https://example.test/manage/secret',
      serviceName: 'Haircut', staffName: 'Stylist', startAt: '2026-10-04T04:00:00.000Z', timezone: 'Asia/Bishkek',
    });
    expect(reminder.text).toContain('+996 555 123456');
    expect(reminder.text).toContain('позвоните по телефону бизнеса');
    expect(reminder.text).not.toContain('manage/secret');
    expect(reminder.html).not.toContain('manage/secret');
  });

  it('keeps SMS and push adapters explicitly skipped until configured', async () => {
    expect(await new SmsProvider().send()).toEqual({ status: 'skipped', reason: 'CHANNEL_NOT_CONFIGURED' });
    expect(await new PushProvider().send()).toEqual({ status: 'skipped', reason: 'CHANNEL_NOT_CONFIGURED' });
  });
});
