import { DateTime } from 'luxon';
import { expect, test } from '@playwright/test';

interface PublicService {
  id: string;
  name: string;
}

interface PublicStaff {
  id: string;
  displayName: string;
}

interface PublicSlot {
  startAt: string;
}

interface BookingResult {
  manageToken: string;
}

test('calendar renders simultaneous bookings in separate visible lanes', async ({ page }) => {
  test.setTimeout(90_000);
  const run = `${Date.now()}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.20.0.${Number(run.slice(-3)) % 254 + 1}` });
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@demo.local');
  await page.getByLabel('Пароль').fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();

  const settingsResponse = await page.request.get('http://localhost:3000/api/settings');
  expect(settingsResponse.ok()).toBeTruthy();
  const settings = (await settingsResponse.json()).data as { business: { slug: string; timezone: string } };
  const serviceResponse = await page.request.get(`http://localhost:3000/api/public/b/${settings.business.slug}/services`);
  expect(serviceResponse.ok()).toBeTruthy();
  const services = (await serviceResponse.json()).data as PublicService[];
  const service = services[0];
  if (!service) throw new Error('Seeded business has no public service');
  const staffResponse = await page.request.get(`http://localhost:3000/api/public/b/${settings.business.slug}/staff?serviceId=${service.id}`);
  expect(staffResponse.ok()).toBeTruthy();
  const staff = (await staffResponse.json()).data as PublicStaff[];
  const [firstStaff, secondStaff] = staff;
  if (!firstStaff || !secondStaff) throw new Error('Seeded business needs two bookable staff members');

  let date = '';
  let startAt = '';
  for (let offset = 8; offset < 28 && !startAt; offset += 1) {
    const candidateDate = DateTime.now().setZone(settings.business.timezone).startOf('day').plus({ days: offset });
    if (candidateDate.weekday === 7) continue;
    const dateValue = candidateDate.toISODate();
    if (!dateValue) continue;
    const availabilityResponses = await Promise.all([firstStaff, secondStaff].map((member) => page.request.get(`http://localhost:3000/api/public/b/${settings.business.slug}/availability?serviceId=${service.id}&staffId=${member.id}&date=${dateValue}`)));
    const firstAvailability = availabilityResponses[0];
    const secondAvailability = availabilityResponses[1];
    if (!firstAvailability || !secondAvailability || !firstAvailability.ok() || !secondAvailability.ok()) continue;
    const firstSlots = (await firstAvailability.json()).data.slots as PublicSlot[];
    const secondSlots = (await secondAvailability.json()).data.slots as PublicSlot[];
    const secondStarts = new Set(secondSlots.map((slot) => slot.startAt));
    startAt = firstSlots.find((slot) => secondStarts.has(slot.startAt))?.startAt ?? '';
    if (startAt) date = dateValue;
  }
  if (!date || !startAt) throw new Error('No common available slot found for two seeded staff members');

  const createdTokens: string[] = [];
  try {
    for (const [index, member] of [firstStaff, secondStaff].entries()) {
      const bookingResponse = await page.request.post(`http://localhost:3000/api/public/b/${settings.business.slug}/appointments`, {
        headers: { Origin: 'http://localhost:5173', 'Idempotency-Key': `calendar-overlap-${run}-${index}` },
        data: {
          serviceId: service.id,
          staffId: member.id,
          startAt,
          acceptPrivacy: true,
          customer: { firstName: `Overlap ${index}`, phone: `${index === 0 ? '+996777' : '+996778'}${run.slice(-6)}` },
        },
      });
      const bookingBody = await bookingResponse.json() as { data?: BookingResult };
      expect(bookingResponse.status(), JSON.stringify(bookingBody)).toBe(201);
      const result = bookingBody.data as BookingResult;
      createdTokens.push(result.manageToken);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/app/calendar');
    await page.getByLabel('Дата').fill(date);
    await page.getByRole('button', { name: 'День' }).click();
    const calendar = page.getByRole('region', { name: 'Календарная сетка' });
    const firstCard = calendar.getByRole('button', { name: new RegExp(`Overlap 0`) });
    const secondCard = calendar.getByRole('button', { name: new RegExp(`Overlap 1`) });
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();
    const firstBounds = await firstCard.boundingBox();
    const secondBounds = await secondCard.boundingBox();
    if (!firstBounds || !secondBounds) throw new Error('Simultaneous calendar cards have no rendered bounds');
    expect(firstBounds.y).toBeCloseTo(secondBounds.y, 0);
    const firstRight = firstBounds.x + firstBounds.width;
    const secondRight = secondBounds.x + secondBounds.width;
    expect(firstRight <= secondBounds.x + 1 || secondRight <= firstBounds.x + 1).toBe(true);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: 'docs/screenshots/calendar-overlap-light.png', fullPage: true, animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: 'docs/screenshots/calendar-overlap-dark.png', fullPage: true, animations: 'disabled' });
  } finally {
    await Promise.all(createdTokens.map((token) => page.request.post(`http://localhost:3000/api/public/manage/${token}/cancel`, { headers: { Origin: 'http://localhost:5173' }, data: {} })));
  }
});
