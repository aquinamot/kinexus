import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verifyPin } from './pin';
import { createSession } from './session';
import { Layout } from '../views/layout';
import type { Env } from '../types';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get('/', async c => {
  const wantsToSwitch = c.req.query('trocar');

  if (!wantsToSwitch) {
    const remembered = getCookie(c, 'kinexus_remembered_user');
    if (remembered) return c.redirect(`/login/${remembered}`);
  } else {
    deleteCookie(c, 'kinexus_remembered_user', { path: '/' });
  }

  const { results: users } = await c.env.DB.prepare('SELECT id, name FROM users ORDER BY name')
    .all<{ id: number; name: string }>();

  return c.html(
    <Layout title="Entrar">
      <h1>Quem está treinando?</h1>
      <ul>
        {(users ?? []).map(u => (
          <li>
            <a href={`/login/${u.id}`}>{u.name}</a>
          </li>
        ))}
      </ul>
    </Layout>
  );
});

authRoutes.get('/:userId', async c => {
  const userId = Number(c.req.param('userId'));
  const user = await c.env.DB.prepare('SELECT id, name FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: number; name: string }>();

  if (!user) return c.notFound();

  setCookie(c, 'kinexus_remembered_user', String(user.id), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return c.html(
    <Layout title={`Entrar — ${user.name}`}>
      <h1>Olá, {user.name}</h1>
      <form method="post" action={`/login/${user.id}`}>
        <input type="password" name="pin" inputmode="numeric" maxlength={4} autofocus />
        <button type="submit">Entrar</button>
      </form>
      <a href="/login?trocar=1">Trocar usuário</a>
    </Layout>
  );
});

authRoutes.post('/:userId', async c => {
  const userId = Number(c.req.param('userId'));
  const body = await c.req.parseBody();
  const pin = String(body.pin ?? '');

  const user = await c.env.DB.prepare(
    'SELECT id, name, pin_hash as pinHash, locked_until as lockedUntil FROM users WHERE id = ?'
  ).bind(userId).first<{
    id: number;
    name: string;
    pinHash: string;
    lockedUntil: number | null;
  }>();

  if (!user) return c.notFound();

  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    return c.html(<Layout title="Entrar"><p>Muitas tentativas. Tente novamente em instantes.</p></Layout>, 429);
  }

  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) {
    // Increment atomically in the database itself — reading the count in app code,
    // then writing count+1 back, loses updates when wrong-PIN requests race each
    // other (every racer reads the same starting count).
    const incremented = await c.env.DB.prepare(
      'UPDATE users SET failed_pin_attempts = failed_pin_attempts + 1 WHERE id = ? RETURNING failed_pin_attempts'
    ).bind(userId).first<{ failed_pin_attempts: number }>();
    const attempts = incremented!.failed_pin_attempts;

    if (attempts >= MAX_ATTEMPTS) {
      await c.env.DB.prepare('UPDATE users SET failed_pin_attempts = 0, locked_until = ? WHERE id = ?')
        .bind(Date.now() + LOCK_MS, userId)
        .run();
    }
    return c.html(<Layout title="Entrar"><p>PIN incorreto.</p></Layout>, 401);
  }

  await c.env.DB.prepare('UPDATE users SET failed_pin_attempts = 0, locked_until = NULL WHERE id = ?')
    .bind(userId)
    .run();

  const session = await createSession(c.env.DB, userId);
  setCookie(c, 'kinexus_session', session.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: new Date(session.expiresAt),
  });

  return c.redirect('/');
});
