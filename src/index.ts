import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import type { Env } from './types';
import { authRoutes } from './auth/routes';
import { requireAuth, type AuthedVars } from './auth/middleware';
import { importRoutes } from './import/routes';
import { workoutsRoutes } from './workouts/routes';

const app = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

app.get('/health', c => c.text('ok'));

app.route('/login', authRoutes);

app.post('/logout', c => {
  deleteCookie(c, 'kinexus_session', { path: '/' });
  deleteCookie(c, 'kinexus_remembered_user', { path: '/' });
  return c.redirect('/login');
});

app.use('*', requireAuth);

app.route('/importar', importRoutes);
app.route('/treinos', workoutsRoutes);

app.get('/', c => c.text(`Logged in as user ${c.get('userId')}`)); // replaced by Task 16

export default app;
