import { describe, expect, it } from 'vitest';
import { buildServiceSnapshot } from '../../packages/server/src/services/inventory-consumption';

describe('buildServiceSnapshot', () => {
  it('accepts older services without optional cost and inventory arrays', async () => {
    const snapshot = await buildServiceSnapshot('business-id', {
      name: 'Старая услуга',
      durationMinutes: 30,
      priceMinor: 1500,
      currency: 'KGS',
    });

    expect(snapshot).toMatchObject({ name: 'Старая услуга', priceMinor: 1500, costMinor: 0, inventoryConsumptions: [] });
  });
});
