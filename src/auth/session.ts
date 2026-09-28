const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Session {
  id: string;
  userId: number;
  expiresAt: number;
}

export async function createSession(db: D1Database, userId: number): Promise<Session> {
  const id = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.prepare('INSERT INTO sessions_auth (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt)
    .run();
  return { id, userId, expiresAt };
}

export async function validateSession(db: D1Database, sessionId: string): Promise<Session | null> {
  const row = await db.prepare(
    'SELECT id, user_id as userId, expires_at as expiresAt FROM sessions_auth WHERE id = ?'
  ).bind(sessionId).first<Session>();

  if (!row) return null;

  if (row.expiresAt < Date.now()) {
    await deleteSession(db, sessionId);
    return null;
  }

  return row;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions_auth WHERE id = ?').bind(sessionId).run();
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
