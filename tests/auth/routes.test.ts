import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';

async function seedUser(name: string, pin: string) {
  const hash = await hashPin(pin);
  const row = await env.DB.prepare(
    'INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id'
  ).bind(name, hash, Date.now()).first<{ id: number }>();
  return row!.id;
}

describe('login routes', () => {
  it('lists users on GET /login', async () => {
    await seedUser('Alice', '1111');
    const res = await SELF.fetch('http://local/login');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Alice');
  });

  it('logs in with the correct pin and sets a session cookie', async () => {
    const userId = await seedUser('Bob', '2222');
    const res = await SELF.fetch(`http://local/login/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=2222',
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toContain('kinexus_session=');
  });

  it('rejects an incorrect pin', async () => {
    const userId = await seedUser('Carol', '3333');
    const res = await SELF.fetch(`http://local/login/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=0000',
      redirect: 'manual',
    });
    expect(res.status).toBe(401);
  });

  it('locks out after 5 failed attempts', async () => {
    const userId = await seedUser('Dave', '4444');
    for (let i = 0; i < 5; i++) {
      await SELF.fetch(`http://local/login/${userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'pin=0000',
      });
    }
    const res = await SELF.fetch(`http://local/login/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=4444', // even the CORRECT pin should be rejected while locked
    });
    expect(res.status).toBe(429);
  });

  it('redirects unauthenticated requests to /login', async () => {
    const res = await SELF.fetch('http://local/', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('skips straight to the pin screen when a user is remembered on this device', async () => {
    const userId = await seedUser('Erin', '5555');
    const visitRes = await SELF.fetch(`http://local/login/${userId}`);
    const remembered = visitRes.headers.get('set-cookie')!.split(';')[0];

    const res = await SELF.fetch('http://local/login', {
      headers: { cookie: remembered },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/login/${userId}`);
  });

  it('"trocar usuário" (?trocar=1) shows the full list even when a user is remembered', async () => {
    const userId = await seedUser('Frank', '6666');
    const visitRes = await SELF.fetch(`http://local/login/${userId}`);
    const remembered = visitRes.headers.get('set-cookie')!.split(';')[0];

    const res = await SELF.fetch('http://local/login?trocar=1', { headers: { cookie: remembered } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Frank');
  });
});
