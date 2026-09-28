import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { validateSession } from './session';
import type { Env } from '../types';

export interface AuthedVars {
  userId: number;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: AuthedVars }> = async (c, next) => {
  const sessionId = getCookie(c, 'kinexus_session');
  if (!sessionId) return c.redirect('/login');

  const session = await validateSession(c.env.DB, sessionId);
  if (!session) return c.redirect('/login');

  c.set('userId', session.userId);
  await next();
};
