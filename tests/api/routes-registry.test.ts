import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MVP_ROUTE_CONTRACTS } from '@/server/http/route-contracts';

describe('MVP Express route registry', () => {
  it('matches the complete MVP ID set in MVP_SCOPE.md', async () => {
    const source = await readFile(new URL('../../docs/MVP_SCOPE.md', import.meta.url), 'utf8');
    const expected = new Set(
      Array.from(source.matchAll(/^\|\s*([A-Z]{2,4}-\d{2})\s*\|[^\n]*\|\s*да\s*\|/gm), (match) => match[1]),
    );
    const actual = new Set(MVP_ROUTE_CONTRACTS.map((route) => route.id));
    expect(actual.size).toBe(64);
    expect(actual).toEqual(expected);
  });
});
