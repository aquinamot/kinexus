import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`sessions-route-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('sessions routes', () => {
  it('starts and then ends a session', async () => {
    const startRes = await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: '',
      redirect: 'manual',
    });
    expect(startRes.status).toBe(302);

    const open = await env.DB.prepare('SELECT id FROM workout_sessions WHERE user_id = ? AND ended_at IS NULL')
      .bind(userId)
      .first();
    expect(open).not.toBeNull();

    const endRes = await SELF.fetch('http://local/sessoes/end', {
      method: 'POST',
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    });
    expect(endRes.status).toBe(302);

    const stillOpen = await env.DB.prepare('SELECT id FROM workout_sessions WHERE user_id = ? AND ended_at IS NULL')
      .bind(userId)
      .first();
    expect(stillOpen).toBeNull();
  });
});
