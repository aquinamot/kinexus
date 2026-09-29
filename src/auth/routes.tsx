import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verifyPin } from './pin';
import { createSession } from './session';
import { Layout } from '../views/layout';
import type { Env } from '../types';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

export const authRoutes = new Hono<{ Bindings: Env }>();

// Teclado de PIN: uma das exceções explícitas do mockup para JS no cliente. O
// campo real (#pin-value) continua um <input> comum dentro de um <form> normal,
// então login funciona sem JS também — o teclado só escreve nele e envia o
// formulário sozinho ao chegar a 4 dígitos.
const PIN_PAD_SCRIPT = `
(() => {
  const input = document.getElementById('pin-value');
  const form = document.getElementById('pin-form');
  const pad = document.getElementById('pad');
  const pips = Array.from(document.querySelectorAll('#pips .pip'));
  if (!input || !form) return;

  function paint() {
    const len = input.value.length;
    pips.forEach((p, i) => p.classList.toggle('full', i < len));
  }

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\\D/g, '').slice(0, 4);
    paint();
    if (input.value.length === 4) setTimeout(() => form.requestSubmit(), 150);
  });

  if (pad) {
    pad.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'back') { window.location.href = '/login?trocar=1'; return; }
      if (b.dataset.act === 'del') { input.value = input.value.slice(0, -1); paint(); return; }
      if (input.value.length >= 4) return;
      input.value += b.textContent.trim();
      paint();
      if (input.value.length === 4) setTimeout(() => form.requestSubmit(), 150);
    });
  }

  paint();
})();
`;

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
      <div class="gate">
        <div class="gate-inner">
          <h1 class="display d-xl">Kinexus</h1>
          <p class="lede">Quem vai treinar?</p>
          <div class="who">
            {(users ?? []).map(u => (
              <a href={`/login/${u.id}`}>
                <span class="av">{u.name.charAt(0).toUpperCase()}</span>
                {u.name}
              </a>
            ))}
          </div>
        </div>
      </div>
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
      <div class="gate">
        <div class="gate-inner">
          <h1 class="display d-lg">Oi, {user.name}</h1>
          <p class="lede">Digite seu PIN de 4 dígitos.</p>
          <div class="pips" id="pips">
            <i class="pip"></i>
            <i class="pip"></i>
            <i class="pip"></i>
            <i class="pip"></i>
          </div>
          <form method="post" action={`/login/${user.id}`} id="pin-form">
            <div class="pad" id="pad">
              <button type="button">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">4</button>
              <button type="button">5</button>
              <button type="button">6</button>
              <button type="button">7</button>
              <button type="button">8</button>
              <button type="button">9</button>
              <button type="button" class="ghost" data-act="back">
                Trocar
              </button>
              <button type="button">0</button>
              <button type="button" class="ghost" data-act="del">
                Apagar
              </button>
            </div>
            <div class="pin-fallback">
              <input
                type="password"
                id="pin-value"
                name="pin"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength={4}
                autofocus
                autocomplete="one-time-code"
                placeholder="PIN"
                class="field"
              />
              <button type="submit" class="btn btn-band">
                Entrar
              </button>
            </div>
          </form>
          <div style="margin-top:16px;text-align:center;">
            <a href="/login?trocar=1" class="link">
              Trocar usuário
            </a>
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: PIN_PAD_SCRIPT }} />
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
    return c.html(
      <Layout title="Entrar">
        <div class="gate">
          <div class="gate-inner center" style="text-align:center;">
            <p class="lede">Muitas tentativas. Tente novamente em instantes.</p>
          </div>
        </div>
      </Layout>,
      429
    );
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
    return c.html(
      <Layout title="Entrar">
        <div class="gate">
          <div class="gate-inner" style="text-align:center;">
            <p class="lede">PIN incorreto.</p>
          </div>
        </div>
      </Layout>,
      401
    );
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
