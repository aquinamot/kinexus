import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';
import { persistImportedPlan } from '../../src/workouts/repo';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`dashboard-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('dashboard route', () => {
  it('prompts to import when there is no active plan', async () => {
    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    expect(await res.text()).toContain('Nenhuma planilha ativa');
  });

  it('shows the next workout day and an "Iniciar treino" button', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Dashboard',
      days: [{ label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] }],
    });

    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('Treino A');
    expect(html).toContain('Iniciar treino');
  });

  it('shows "Finalizar treino" while a session is open', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Dashboard 2',
      days: [{ label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] }],
    });

    await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: '',
    });

    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    expect(await res.text()).toContain('Finalizar treino');
  });

  it('advances to the next day in rotation after a session is finished (not just while open)', async () => {
    const planId = await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Rotação',
      days: [
        { label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] },
        { label: 'B', focusName: 'Costas', exercises: [{ exerciseId: null, customName: 'Remada', sets: 4, reps: '10', youtubeUrl: null }] },
      ],
    });

    // First visit: nothing trained yet, should show Treino A.
    const before = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    expect(await before.text()).toContain('Treino A');

    // Start and finish Treino A — pass its real workoutDayId, exactly like the
    // dashboard's hidden form field does, so the rotation has something to advance from.
    const dayA = await env.DB.prepare("SELECT id FROM workout_days WHERE plan_id = ? AND label = 'A'")
      .bind(planId)
      .first<{ id: number }>();

    await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: `workoutDayId=${dayA!.id}`,
    });
    await SELF.fetch('http://local/sessoes/end', { method: 'POST', headers: { cookie: sessionCookie } });

    // No session is open anymore, but the dashboard must still advance to Treino B.
    const after = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    const afterHtml = await after.text();
    expect(afterHtml).toContain('Treino B');
    expect(afterHtml).toContain('Iniciar treino');
  });

  it('shows the day of the open session (not the next one in rotation) while it is still running', async () => {
    const planId = await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Aberto',
      days: [
        { label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] },
        { label: 'B', focusName: 'Costas', exercises: [{ exerciseId: null, customName: 'Remada', sets: 4, reps: '10', youtubeUrl: null }] },
      ],
    });
    const dayA = await env.DB.prepare("SELECT id FROM workout_days WHERE plan_id = ? AND label = 'A'")
      .bind(planId)
      .first<{ id: number }>();

    await SELF.fetch('http://local/sessoes/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: `workoutDayId=${dayA!.id}`,
    });

    // The session for Treino A is still open — the dashboard must keep showing A
    // (and its exercises), not jump ahead to B just because A is "the last session".
    const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('Treino A');
    expect(html).not.toContain('Treino B');
    expect(html).toContain('Finalizar treino');
  });

  it('shows the São Paulo month/year in the calendar header, not the UTC one', async () => {
    // 2026-10-01T01:00:00Z = 2026-09-30T22:00:00-03:00 in São Paulo — still September.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T01:00:00Z'));
    try {
      const res = await SELF.fetch('http://local/', { headers: { cookie: sessionCookie } });
      const html = await res.text();
      expect(html).toContain('Frequência — 9/2026');
    } finally {
      vi.useRealTimers();
    }
  });
});
