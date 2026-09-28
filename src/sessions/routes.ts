import { Hono } from 'hono';
import { startSession, endSession, getOpenSession } from './repo';
import type { Env } from '../types';
import type { AuthedVars } from '../auth/middleware';

export const sessionsRoutes = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

sessionsRoutes.post('/start', async c => {
  const userId = c.get('userId');
  const body = await c.req.parseBody();
  const workoutDayId = body.workoutDayId ? Number(body.workoutDayId) : null;
  await startSession(c.env.DB, userId, workoutDayId);
  return c.redirect('/');
});

sessionsRoutes.post('/end', async c => {
  const userId = c.get('userId');
  const open = await getOpenSession(c.env.DB, userId);
  if (open) await endSession(c.env.DB, open.id);
  return c.redirect('/');
});
