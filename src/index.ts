import { Hono } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './types';
import { authRoutes } from './auth/routes';
import { requireAuth, type AuthedVars } from './auth/middleware';
import { deleteSession } from './auth/session';
import { importRoutes } from './import/routes';
import { workoutsRoutes } from './workouts/routes';
import { sessionsRoutes } from './sessions/routes';
import { dashboardRoutes } from './dashboard/routes';

const app = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

app.get('/health', c => c.text('ok'));

app.route('/login', authRoutes);

app.post('/logout', async c => {
  const sessionId = getCookie(c, 'kinexus_session');
  if (sessionId) await deleteSession(c.env.DB, sessionId);
  deleteCookie(c, 'kinexus_session', { path: '/' });
  deleteCookie(c, 'kinexus_remembered_user', { path: '/' });
  return c.redirect('/login');
});

app.use('*', requireAuth);

app.route('/importar', importRoutes);
app.route('/treinos', workoutsRoutes);
app.route('/sessoes', sessionsRoutes);
app.route('/', dashboardRoutes);

export default app;
