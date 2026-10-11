import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MVP_ROUTE_CONTRACTS, OPTIONAL_EXTENSION_ROUTE_CONTRACTS } from '@/server/http/route-contracts';
import { IMPLEMENTED_AUTH_ROUTE_IDS } from '@/server/http/auth-routes';
import { IMPLEMENTED_STAFF_ROUTE_IDS } from '@/server/http/staff-routes';
import { IMPLEMENTED_SERVICE_ROUTE_IDS } from '@/server/http/service-routes';
import { IMPLEMENTED_SCHEDULE_ROUTE_IDS } from '@/server/http/staff-schedule-routes';
import { IMPLEMENTED_CUSTOMER_ROUTE_IDS } from '@/server/http/customer-routes';
import { IMPLEMENTED_SETTINGS_ROUTE_IDS } from '@/server/http/settings-routes';
import { IMPLEMENTED_AVAILABILITY_ROUTE_IDS } from '@/server/http/availability-routes';
import { IMPLEMENTED_APPOINTMENT_ROUTE_IDS } from '@/server/http/appointment-routes';
import { IMPLEMENTED_PUBLIC_BOOKING_ROUTE_IDS } from '@/server/http/public-booking-routes';
import { IMPLEMENTED_BLOCKED_PERIOD_ROUTE_IDS } from '@/server/http/blocked-period-routes';
import { IMPLEMENTED_MEMBER_ROUTE_IDS } from '@/server/http/member-routes';
import { IMPLEMENTED_CALENDAR_ROUTE_IDS } from '@/server/http/calendar-routes';
import { IMPLEMENTED_NOTIFICATION_ROUTE_IDS } from '@/server/http/notification-routes';
import { IMPLEMENTED_PAYMENT_ROUTE_IDS } from '@/server/http/payment-routes';
import { IMPLEMENTED_DASHBOARD_ROUTE_IDS } from '@/server/http/dashboard-routes';
import { IMPLEMENTED_INBOX_NOTIFICATION_ROUTE_IDS } from '@/server/http/inbox-notification-routes';
import { IMPLEMENTED_INVENTORY_ROUTE_IDS } from '@/server/http/inventory-routes';
import { IMPLEMENTED_WAITLIST_ROUTE_IDS } from '@/server/http/waitlist-routes';

const implementedRouteIds = new Set([
  'SYS-01',
  ...IMPLEMENTED_AUTH_ROUTE_IDS,
  ...IMPLEMENTED_STAFF_ROUTE_IDS,
  ...IMPLEMENTED_SERVICE_ROUTE_IDS,
  ...IMPLEMENTED_SCHEDULE_ROUTE_IDS,
  ...IMPLEMENTED_CUSTOMER_ROUTE_IDS,
  ...IMPLEMENTED_SETTINGS_ROUTE_IDS,
  ...IMPLEMENTED_AVAILABILITY_ROUTE_IDS,
  ...IMPLEMENTED_APPOINTMENT_ROUTE_IDS,
  ...IMPLEMENTED_PUBLIC_BOOKING_ROUTE_IDS,
  ...IMPLEMENTED_BLOCKED_PERIOD_ROUTE_IDS,
  ...IMPLEMENTED_MEMBER_ROUTE_IDS,
  ...IMPLEMENTED_CALENDAR_ROUTE_IDS,
  ...IMPLEMENTED_NOTIFICATION_ROUTE_IDS,
  ...IMPLEMENTED_PAYMENT_ROUTE_IDS,
  ...IMPLEMENTED_DASHBOARD_ROUTE_IDS,
]);

describe('MVP Express route registry', () => {
  it('matches the complete MVP ID set in MVP_SCOPE.md', async () => {
    const source = await readFile(new URL('../../docs/MVP_SCOPE.md', import.meta.url), 'utf8');
    const expected = new Set(
      Array.from(source.matchAll(/^\|\s*([A-Z]{2,4}-\d{2})\s*\|[^\n]*\|\s*да\s*\|/gm), (match) => match[1]),
    );
    const actual = new Set(MVP_ROUTE_CONTRACTS.map((route) => route.id));
    expect(actual.size).toBe(68);
    expect(actual).toEqual(expected);
  });

  it('has a concrete route handler for all 68 MVP endpoints', () => {
    expect(implementedRouteIds.size).toBe(68);
    expect(implementedRouteIds).toEqual(new Set(MVP_ROUTE_CONTRACTS.map((route) => route.id)));
  });

  it('registers every optional notification, inventory, and waitlist route', () => {
    const implemented = new Set([...IMPLEMENTED_INBOX_NOTIFICATION_ROUTE_IDS, ...IMPLEMENTED_INVENTORY_ROUTE_IDS, ...IMPLEMENTED_WAITLIST_ROUTE_IDS]);
    expect(implemented).toEqual(new Set(OPTIONAL_EXTENSION_ROUTE_CONTRACTS.map((route) => route.id)));
  });
});
