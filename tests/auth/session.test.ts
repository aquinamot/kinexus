import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createSession, validateSession, deleteSession } from '../../src/auth/session';

describe('auth sessions', () => {
  it('creates a session and validates it', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (name, pin_hash, created_at) VALUES ('Test', 'x', ?) RETURNING id"
    ).bind(Date.now()).first<{ id: number }>();

    const session = await createSession(env.DB, user!.id);
    const validated = await validateSession(env.DB, session.id);

    expect(validated?.userId).toBe(user!.id);
  });

  it('returns null for an unknown session id', async () => {
    expect(await validateSession(env.DB, 'does-not-exist')).toBeNull();
  });

  it('returns null after the session is deleted', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (name, pin_hash, created_at) VALUES ('Test2', 'x', ?) RETURNING id"
    ).bind(Date.now()).first<{ id: number }>();

    const session = await createSession(env.DB, user!.id);
    await deleteSession(env.DB, session.id);

    expect(await validateSession(env.DB, session.id)).toBeNull();
  });
});
