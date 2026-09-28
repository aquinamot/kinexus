import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('health check', () => {
  it('GET /health returns ok', async () => {
    const res = await SELF.fetch('http://local/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
