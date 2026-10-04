import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { defineRoute } from '@/server/http/define-route';

const bodySchema = z.object({ value: z.string().min(1) }).strict();

describe('defineRoute', () => {
  it('validates strict JSON request bodies and returns the standard error envelope', async () => {
    const handler = defineRoute({
      id: 'TEST-STRICT',
      method: 'POST',
      path: '/api/test',
      auth: 'none',
      contextSource: 'NONE',
      bodySchema,
      handler: async ({ body }) => body,
    });

    const response = await handler(
      new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ value: 'ok', businessId: 'forbidden' }),
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; requestId: string };
    }; // Assert the exact API error envelope this test exercises.

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.requestId).toBe(response.headers.get('X-Request-Id'));
  });
});
