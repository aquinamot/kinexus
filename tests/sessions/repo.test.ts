import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { startSession, endSession, getOpenSession, getLastSession, getTrainedDaysInMonth } from '../../src/sessions/repo';

let userId: number;

beforeEach(async () => {
  const row = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, 'x', ?) RETURNING id"
  ).bind(`session-user-${Math.random()}`, Date.now()).first<{ id: number }>();
  userId = row!.id;
});

describe('startSession / getOpenSession / endSession', () => {
  it('starts a session and finds it as open', async () => {
    const session = await startSession(env.DB, userId, null);
    const open = await getOpenSession(env.DB, userId);
    expect(open?.id).toBe(session.id);
    expect(open?.endedAt).toBeNull();
  });

  it('reuses the existing open session instead of creating a new one', async () => {
    const first = await startSession(env.DB, userId, null);
    const second = await startSession(env.DB, userId, null);
    expect(second.id).toBe(first.id);

    const { results } = await env.DB.prepare('SELECT COUNT(*) as n FROM workout_sessions WHERE user_id = ?')
      .bind(userId)
      .all<{ n: number }>();
    expect(results![0].n).toBe(1);
  });

  it('ends a session and it is no longer open', async () => {
    const session = await startSession(env.DB, userId, null);
    await endSession(env.DB, session.id);
    expect(await getOpenSession(env.DB, userId)).toBeNull();

    const row = await env.DB.prepare('SELECT duration_counted as durationCounted FROM workout_sessions WHERE id = ?')
      .bind(session.id)
      .first<{ durationCounted: number }>();
    expect(row?.durationCounted).toBe(1);
  });

  it('auto-closes a session open for more than 5 hours, without counting duration', async () => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const row = await env.DB.prepare(
      'INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, NULL, ?, ?, NULL, NULL) RETURNING id'
    ).bind(userId, '2026-09-01', sixHoursAgo).first<{ id: number }>();

    expect(await getOpenSession(env.DB, userId)).toBeNull();

    const closed = await env.DB.prepare(
      'SELECT ended_at as endedAt, duration_counted as durationCounted FROM workout_sessions WHERE id = ?'
    ).bind(row!.id).first<{ endedAt: number; durationCounted: number }>();
    expect(closed?.endedAt).toBe(sixHoursAgo + 5 * 60 * 60 * 1000);
    expect(closed?.durationCounted).toBe(0);
  });
});

describe('getTrainedDaysInMonth', () => {
  it('includes days from auto-closed sessions', async () => {
    await env.DB.prepare(
      "INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, NULL, '2026-09-15', 0, 100, 0)"
    ).bind(userId).run();

    const days = await getTrainedDaysInMonth(env.DB, userId, 2026, 9);
    expect(days).toContain('2026-09-15');
  });
});

describe('getLastSession', () => {
  it('returns the most recently started session, whether open or closed', async () => {
    const planRow = await env.DB.prepare(
      "INSERT INTO workout_plans (user_id, name, created_at, is_active) VALUES (?, 'Plano Teste', ?, 1) RETURNING id"
    ).bind(userId, Date.now()).first<{ id: number }>();
    const dayA = await env.DB.prepare(
      "INSERT INTO workout_days (plan_id, label, focus_name, day_order) VALUES (?, 'A', 'Peito', 0) RETURNING id"
    ).bind(planRow!.id).first<{ id: number }>();
    const dayB = await env.DB.prepare(
      "INSERT INTO workout_days (plan_id, label, focus_name, day_order) VALUES (?, 'B', 'Costas', 1) RETURNING id"
    ).bind(planRow!.id).first<{ id: number }>();

    await env.DB.prepare(
      "INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, ?, '2026-09-10', 1000, 2000, 1)"
    ).bind(userId, dayA!.id).run();
    await env.DB.prepare(
      "INSERT INTO workout_sessions (user_id, workout_day_id, date, started_at, ended_at, duration_counted) VALUES (?, ?, '2026-09-20', 5000, 6000, 1)"
    ).bind(userId, dayB!.id).run();

    const last = await getLastSession(env.DB, userId);
    expect(last?.workoutDayId).toBe(dayB!.id);
  });

  it('returns null when the user has never trained', async () => {
    expect(await getLastSession(env.DB, userId)).toBeNull();
  });
});
