import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';
import { persistImportedPlan, getActivePlan } from '../../src/workouts/repo';

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

  it('prefers the pasted YouTube link over Garmin media, and shows the link on the exercise detail page', async () => {
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
            { exerciseId: exerciseRow!.id, customName: null, sets: 3, reps: '10', youtubeUrl: null },
            { exerciseId: null, customName: 'Exercício sem nenhuma referência', sets: 3, reps: '12', youtubeUrl: null },
          ],
        },
      ],
    });

    const res = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    const html = await res.text();
    // Os três estados aparecem lado a lado: o link do usuário ganha da imagem da
    // Garmin no primeiro, o segundo cai na imagem da Garmin, o terceiro é avulso.
    expect(html).toContain('Seu vídeo');
    expect(html).toContain('Imagem da Garmin');
    expect(html).toContain('Sem referência');

    // O link em si mora na tela de detalhe, não na lista.
    const withYoutube = await env.DB.prepare(
      'SELECT id FROM workout_exercises WHERE youtube_url IS NOT NULL ORDER BY id DESC LIMIT 1'
    ).first<{ id: number }>();
    const detailRes = await SELF.fetch(`http://local/treinos/exercicio/${withYoutube!.id}`, {
      headers: { cookie: sessionCookie },
    });
    expect(await detailRes.text()).toContain('https://youtube.com/watch?v=abc123');
  });

  it('lets the user paste a YouTube link for an exercise without reimporting the whole plan', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano Z',
      days: [
        { label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'Perdigueiro', sets: 3, reps: '6/lado', youtubeUrl: null }] },
      ],
    });

    const exercise = await env.DB.prepare(
      "SELECT we.id FROM workout_exercises we JOIN workout_days wd ON wd.id = we.workout_day_id WHERE wd.label = 'A'"
    ).first<{ id: number }>();

    const res = await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}/youtube`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'youtube=' + encodeURIComponent('https://youtube.com/watch?v=novo'),
      redirect: 'manual',
    });
    expect(res.status).toBe(302);

    const updated = await env.DB.prepare('SELECT youtube_url as youtubeUrl FROM workout_exercises WHERE id = ?')
      .bind(exercise!.id)
      .first<{ youtubeUrl: string }>();
    expect(updated?.youtubeUrl).toBe('https://youtube.com/watch?v=novo');
  });

  it('refuses to save a link that is not http(s), keeping the previous one', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano J',
      days: [
        { label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'Prancha', sets: 3, reps: '30s', youtubeUrl: 'https://youtube.com/watch?v=antigo' }] },
      ],
    });
    const exercise = await env.DB.prepare('SELECT id FROM workout_exercises ORDER BY id DESC LIMIT 1').first<{ id: number }>();

    const res = await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}/youtube`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'youtube=' + encodeURIComponent('javascript:alert(1)'),
      redirect: 'manual',
    });
    expect(res.status).toBe(302);

    const row = await env.DB.prepare('SELECT youtube_url as youtubeUrl FROM workout_exercises WHERE id = ?')
      .bind(exercise!.id)
      .first<{ youtubeUrl: string | null }>();
    expect(row?.youtubeUrl).toBe('https://youtube.com/watch?v=antigo');
  });

  it('never renders a stored non-http(s) link as a clickable href', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano K',
      days: [
        { label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'Ponte', sets: 3, reps: '12', youtubeUrl: null }] },
      ],
    });
    const exercise = await env.DB.prepare('SELECT id FROM workout_exercises ORDER BY id DESC LIMIT 1').first<{ id: number }>();
    // Simula um link gravado antes da validação existir.
    await env.DB.prepare('UPDATE workout_exercises SET youtube_url = ? WHERE id = ?')
      .bind('javascript:alert(1)', exercise!.id)
      .run();

    const html = await (
      await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}`, { headers: { cookie: sessionCookie } })
    ).text();
    expect(html).not.toContain('href="javascript:');
  });

  it('embeds the pasted YouTube video on the exercise detail page', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano M',
      days: [
        { label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'Ponte', sets: 3, reps: '12', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }] },
      ],
    });
    const exercise = await env.DB.prepare('SELECT id FROM workout_exercises ORDER BY id DESC LIMIT 1').first<{ id: number }>();

    const html = await (
      await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}`, { headers: { cookie: sessionCookie } })
    ).text();
    expect(html).toContain('<iframe');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    // Se o dono do vídeo bloquear incorporação, o link direto continua ali.
    expect(html).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
  });

  it('falls back to a plain link when the saved URL is not an embeddable YouTube video', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano N',
      days: [
        { label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'Ponte', sets: 3, reps: '12', youtubeUrl: 'https://vimeo.com/123456' }] },
      ],
    });
    const exercise = await env.DB.prepare('SELECT id FROM workout_exercises ORDER BY id DESC LIMIT 1').first<{ id: number }>();

    const html = await (
      await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}`, { headers: { cookie: sessionCookie } })
    ).text();
    expect(html).not.toContain('<iframe');
    expect(html).toContain('href="https://vimeo.com/123456"');
  });

  it('tells the user the link applies only to this day of the plan', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano L',
      days: [
        { label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'Ponte', sets: 3, reps: '12', youtubeUrl: 'https://youtube.com/watch?v=x' }] },
      ],
    });
    const exercise = await env.DB.prepare('SELECT id FROM workout_exercises ORDER BY id DESC LIMIT 1').first<{ id: number }>();

    const html = await (
      await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}`, { headers: { cookie: sessionCookie } })
    ).text();
    expect(html).not.toContain('todos os dias da planilha');
    expect(html).toContain('só neste dia');
  });

  it("refuses to update another user's exercise", async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano privado',
      days: [{ label: 'A', focusName: 'Core', exercises: [{ exerciseId: null, customName: 'X', sets: 3, reps: '10', youtubeUrl: null }] }],
    });
    const exercise = await env.DB.prepare(
      "SELECT we.id FROM workout_exercises we JOIN workout_days wd ON wd.id = we.workout_day_id WHERE wd.label = 'A'"
    ).first<{ id: number }>();

    const hash = await hashPin('9999');
    const otherUser = await env.DB.prepare(
      "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
    ).bind(`intruder-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
    const otherLogin = await SELF.fetch(`http://local/login/${otherUser!.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pin=9999',
      redirect: 'manual',
    });
    const otherCookie = otherLogin.headers.get('set-cookie')!.split(';')[0];

    await SELF.fetch(`http://local/treinos/exercicio/${exercise!.id}/youtube`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: otherCookie },
      body: 'youtube=' + encodeURIComponent('https://youtube.com/watch?v=hijack'),
    });

    const unchanged = await env.DB.prepare('SELECT youtube_url as youtubeUrl FROM workout_exercises WHERE id = ?')
      .bind(exercise!.id)
      .first<{ youtubeUrl: string | null }>();
    expect(unchanged?.youtubeUrl).toBeNull();
  });

  it('deletes the active plan and shows the empty state afterwards', async () => {
    await persistImportedPlan(env.DB, userId, {
      planName: 'Plano a apagar',
      days: [{ label: 'A', focusName: 'Peito', exercises: [{ exerciseId: null, customName: 'Supino', sets: 4, reps: '8-10', youtubeUrl: null }] }],
    });

    const res = await SELF.fetch('http://local/treinos/excluir', {
      method: 'POST',
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);

    expect(await getActivePlan(env.DB, userId)).toBeNull();

    const after = await SELF.fetch('http://local/treinos', { headers: { cookie: sessionCookie } });
    expect(await after.text()).toContain('Nenhuma planilha ativa');
  });
});
