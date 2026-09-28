import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('seeded users', () => {
  it('has exactly Bruno, Michele and Cecília', async () => {
    const { results } = await env.DB.prepare('SELECT name FROM users ORDER BY name').all<{ name: string }>();
    const names = (results ?? []).map(r => r.name);
    expect(names).toEqual(['Bruno', 'Cecília', 'Michele']);
  });
});
