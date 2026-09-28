import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { hashPin } from '../../src/auth/pin';

let sessionCookie: string;
let userId: number;

beforeEach(async () => {
  const hash = await hashPin('1234');
  const userRow = await env.DB.prepare(
    "INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?) RETURNING id"
  ).bind(`import-user-${Math.random()}`, hash, Date.now()).first<{ id: number }>();
  userId = userRow!.id;

  const loginRes = await SELF.fetch(`http://local/login/${userId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0];
});

describe('import routes', () => {
  it('shows an error for unparseable input, without saving anything', async () => {
    const res = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent('texto solto sem nenhum padrão reconhecível'),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Não consegui reconhecer');

    const plans = await env.DB.prepare('SELECT COUNT(*) as n FROM workout_plans WHERE user_id = ?')
      .bind(userId)
      .first<{ n: number }>();
    expect(plans?.n).toBe(0);
  });

  it('previews a valid JSON workout with an exact catalog match', async () => {
    await env.DB.prepare("INSERT INTO exercises (name, muscle_group) VALUES ('Supino reto com barra', 'Peito')").run();

    const raw = JSON.stringify({
      plano: 'Plano A',
      dias: [{ label: 'A', foco: 'Peito', exercicios: [{ nome: 'Supino reto com barra', series: 4, reps: '8-10' }] }],
    });

    const res = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent(raw),
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Supino reto com barra');
    expect(html).not.toContain('resolve_'); // matched exactly, no resolution needed
  });

  it('confirms a previewed plan and persists it', async () => {
    const raw = JSON.stringify({
      plano: 'Plano B',
      dias: [{ label: 'A', foco: 'Peito', exercicios: [{ nome: 'Exercício inexistente', series: 3, reps: '10' }] }],
    });

    const previewRes = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent(raw),
    });
    const previewHtml = await previewRes.text();
    const workoutJson = previewHtml.match(/name="workout" value="([^"]+)"/)?.[1];
    expect(workoutJson).toBeTruthy();

    const confirmBody = new URLSearchParams();
    confirmBody.set('workout', decodeHtmlEntities(workoutJson!));
    confirmBody.set('resolve_0_0', 'avulso');

    const confirmRes = await SELF.fetch('http://local/importar/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: confirmBody.toString(),
      redirect: 'manual',
    });

    expect(confirmRes.status).toBe(302);

    const plan = await env.DB.prepare('SELECT name FROM workout_plans WHERE user_id = ? AND is_active = 1')
      .bind(userId)
      .first<{ name: string }>();
    expect(plan?.name).toBe('Plano B');
  });

  it('persists the "youtube" link supplied per exercise in the pasted JSON', async () => {
    const raw = JSON.stringify({
      plano: 'Plano C',
      dias: [
        {
          label: 'A',
          foco: 'Peito',
          exercicios: [
            { nome: 'Exercício sem catálogo', series: 3, reps: '10', youtube: 'https://youtube.com/watch?v=xyz' },
          ],
        },
      ],
    });

    const previewRes = await SELF.fetch('http://local/importar/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: 'raw=' + encodeURIComponent(raw),
    });
    const previewHtml = await previewRes.text();
    const workoutJson = previewHtml.match(/name="workout" value="([^"]+)"/)?.[1];

    const confirmBody = new URLSearchParams();
    confirmBody.set('workout', decodeHtmlEntities(workoutJson!));
    confirmBody.set('resolve_0_0', 'avulso');

    await SELF.fetch('http://local/importar/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessionCookie },
      body: confirmBody.toString(),
    });

    const saved = await env.DB.prepare(
      `SELECT we.youtube_url as youtubeUrl FROM workout_exercises we
       JOIN workout_days wd ON wd.id = we.workout_day_id
       JOIN workout_plans wp ON wp.id = wd.plan_id
       WHERE wp.user_id = ? AND wp.is_active = 1`
    ).bind(userId).first<{ youtubeUrl: string }>();
    expect(saved?.youtubeUrl).toBe('https://youtube.com/watch?v=xyz');
  });
});

function decodeHtmlEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
