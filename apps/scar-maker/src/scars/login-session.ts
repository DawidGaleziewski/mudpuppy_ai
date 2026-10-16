// A tiny session store for the login scars (SC-14…SC-16): one test user, a session cookie per
// scar. The password is a fixture, obviously fake, and never a real secret.

import type { ScarContext } from '../types.js';

export const SCAR_USER = 'scar.tester';
export const SCAR_PASSWORD = 'test-password-not-real';

export const loggedIn = (ctx: ScarContext, scar: string): boolean =>
  ctx.cookies[`${scar}_session`] !== undefined &&
  ctx.memory.has(`${scar}:session:${ctx.cookies[`${scar}_session`]}`);

/** A new session id, remembered; the caller sets the cookie. */
export function openSession(ctx: ScarContext, scar: string): string {
  const id = Math.random().toString(36).slice(2, 12);
  ctx.memory.set(`${scar}:session:${id}`, true);
  return id;
}

export const sessionCookie = (scar: string, id: string, path = '/'): Record<string, string> => ({
  'set-cookie': `${scar}_session=${id}; Path=${path}; HttpOnly`,
});

export const credentialsOk = (user: string | null, pass: string | null): boolean =>
  user === SCAR_USER && pass === SCAR_PASSWORD;
