import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('schema', () => {
  it('creates all expected tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
    ).all<{ name: string }>();
    const names = (results ?? []).map(r => r.name).sort();
    expect(names).toEqual([
      'exercises',
      'sessions_auth',
      'users',
      'workout_days',
      'workout_exercises',
      'workout_plans',
      'workout_sessions',
    ]);
  });
});
