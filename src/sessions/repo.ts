const AUTO_CLOSE_MS = 5 * 60 * 60 * 1000; // 5 hours

export interface WorkoutSession {
  id: number;
  userId: number;
  workoutDayId: number | null;
  date: string;
  startedAt: number;
  endedAt: number | null;
  durationCounted: boolean | null;
}

export async function getOpenSession(db: D1Database, userId: number): Promise<WorkoutSession | null> {
  const row = await db.prepare(
    `SELECT id, user_id as userId, workout_day_id as workoutDayId, date,
            started_at as startedAt, ended_at as endedAt, duration_counted as durationCounted
     FROM workout_sessions
     WHERE user_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`
  ).bind(userId).first<WorkoutSession>();

  if (!row) return null;

  if (Date.now() - row.startedAt > AUTO_CLOSE_MS) {
    await db.prepare('UPDATE workout_sessions SET ended_at = ?, duration_counted = 0 WHERE id = ?')
      .bind(row.startedAt + AUTO_CLOSE_MS, row.id)
      .run();
    return null;
  }

  return row;
}

export async function startSession(
  db: D1Database,
  userId: number,
  workoutDayId: number | null
): Promise<WorkoutSession> {
  const existing = await getOpenSession(db, userId);
  if (existing) return existing;

  const now = Date.now();
  const date = new Date(now).toISOString().slice(0, 10);
  const row = await db.prepare(
    'INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, ?, ?, ?, NULL, NULL) RETURNING id'
  ).bind(userId, workoutDayId, date, now).first<{ id: number }>();

  return { id: row!.id, userId, workoutDayId, date, startedAt: now, endedAt: null, durationCounted: null };
}

export async function endSession(db: D1Database, sessionId: number): Promise<void> {
  await db.prepare('UPDATE workout_sessions SET ended_at = ?, duration_counted = 1 WHERE id = ? AND ended_at IS NULL')
    .bind(Date.now(), sessionId)
    .run();
}

export async function getTrainedDaysInMonth(
  db: D1Database,
  userId: number,
  year: number,
  month: number
): Promise<string[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const { results } = await db.prepare('SELECT DISTINCT date FROM workout_sessions WHERE user_id = ? AND date LIKE ?')
    .bind(userId, `${prefix}-%`)
    .all<{ date: string }>();
  return (results ?? []).map(r => r.date);
}

export async function getLastSession(db: D1Database, userId: number): Promise<WorkoutSession | null> {
  const row = await db.prepare(
    `SELECT id, user_id as userId, workout_day_id as workoutDayId, date,
            started_at as startedAt, ended_at as endedAt, duration_counted as durationCounted
     FROM workout_sessions
     WHERE user_id = ?
     ORDER BY started_at DESC
     LIMIT 1`
  ).bind(userId).first<WorkoutSession>();

  return row ?? null;
}
