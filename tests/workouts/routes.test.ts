import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';
import { persistImportedPlan } from '../../src/workouts/repo';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`workouts-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('workouts routes', () => {
  it('shows a message when there is no active plan', async () => {
    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    expect(await res.text()).toContain('Nenhuma planilha ativa');
  });

  it('shows the active plan with day tabs and exercises', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano X',
      days: [
        { label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] },
        { label: 'B', focusName: 'Costas', exercises: [{ exerciseId: null, customName: 'Remada', sets: 3, reps: '10', youtubeUrl: null }] },
      ],
    });

    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('Treino A');
    expect(html).toContain('Treino B');
    expect(html).toContain('Supino');
  });

  it('shows a YouTube link when the imported exercise has one, and falls back to the Garmin image otherwise', async () => {
    const exerciseRow = await env.DB.prepare(
      "INSERT INTO exercises (name, muscle_group, garmin_image_url) VALUES ('Supino reto com barra', 'Peito', 'https://connect.garmin.com/img.jpg') RETURNING id"
    ).first<{ id: number }>();

    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Y',
      days: [
        {
          label: 'A',
          focusName: 'Peito',
          exercises: [
            { exerciseId: exerciseRow!.id, customName: null, sets: 4, reps: '8-10', youtubeUrl: 'https://youtube.com/watch?v=abc123' },
            { exerciseId: null, customName: 'Exercício sem nenhuma referência', sets: 3, reps: '12', youtubeUrl: null },
          ],
        },
      ],
    });

    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('https://youtube.com/watch?v=abc123');
    expect(html).toContain('Sem referência disponível');
  });
});
