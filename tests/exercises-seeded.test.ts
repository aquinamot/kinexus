import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('seeded exercise catalog', () => {
  it('has a reasonable number of exercises with pt-BR names and image URLs', async () => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as n FROM exercises').all<{ n: number }>();
    expect(results![0].n).toBeGreaterThan(50);

    const sample = await env.DB.prepare(
      "SELECT name, garmin_image_url as garminImageUrl FROM exercises WHERE name LIKE '%Flexão%braços%' AND garmin_image_url IS NOT NULL LIMIT 1"
    ).first<{ name: string; garminImageUrl: string | null }>();
    expect(sample).not.toBeNull();
    expect(sample?.garminImageUrl).toContain('https://connect.garmin.com');
  });
});
