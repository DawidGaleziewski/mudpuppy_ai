// SC-16 (field GC-09, the main design topic): a login through an identity provider on another host
// with a slow multi-hop redirect chain. Portal `/sc16/login` → IdP (127.0.0.2) sign-in form →
// submit → an IdP "checking your device" page that script-redirects after 1.5 s → IdP 302 →
// portal `/sc16/callback` (sets the session) → 302 → `/sc16/dashboard`. A single success check
// right after submit runs on the IdP host mid-chain and reports a failure although the user lands
// on the dashboard. Portal file: `portals/scar-maker-sso`.

import { html, page, redirect } from '../page.js';
import type { Handler, Scar } from '../types.js';
import { credentialsOk, loggedIn, openSession, sessionCookie } from './login-session.js';

const IDP_FORM = (
  error = '',
) => `${error}<form method="post" action="/sc16/idp/authorize" aria-label="Identity provider sign-in">
<label for="u">User name</label><input id="u" name="u">
<label for="p">Password</label><input id="p" name="p" type="password">
<button type="submit">Continue</button></form>`;

/** Only the second host plays the identity provider. */
const onIdp =
  (h: Handler): Handler =>
  (req, res, ctx) =>
    ctx.host === 'second'
      ? h(req, res, ctx)
      : html(res, page('Not here', '<p>Wrong host.</p>'), 404);

const authorize: Handler = (req, res, ctx) => {
  if (req.method !== 'POST') return html(res, page('Sign in to your account', IDP_FORM()));
  const f = new URLSearchParams(ctx.body);
  if (!credentialsOk(f.get('u'), f.get('p')))
    return html(
      res,
      page('Sign in to your account', IDP_FORM('<p role="alert">The sign-in failed.</p>')),
    );
  const code = Math.random().toString(36).slice(2, 10);
  ctx.memory.set(`sc16:code:${code}`, true);
  redirect(res, `/sc16/idp/check?code=${code}`, 303);
};

const check: Handler = (_req, res, ctx) =>
  html(
    res,
    page(
      'Checking your device…',
      `<p>Please wait.</p><script>setTimeout(function () { location.href = '/sc16/idp/done?code=${ctx.query.get('code') ?? ''}'; }, 1500);</script>`,
    ),
  );

const done: Handler = (_req, res, ctx) =>
  redirect(res, `${ctx.portal}/sc16/callback?code=${ctx.query.get('code') ?? ''}`);

const callback: Handler = (_req, res, ctx) => {
  const code = ctx.query.get('code') ?? '';
  if (!ctx.memory.delete(`sc16:code:${code}`)) return redirect(res, '/sc16/login');
  redirect(res, '/sc16/dashboard', 302, sessionCookie('sc16', openSession(ctx, 'sc16')));
};

export const sc16: Scar = {
  id: 'SC-16',
  entry: '/sc16/',
  routes: {
    '/sc16/': (_req, res) => html(res, page('Customer portal', '<a href="/sc16/login">Log in</a>')),
    '/sc16/login': (_req, res, ctx) => redirect(res, `${ctx.second}/sc16/idp/authorize`),
    '/sc16/idp/authorize': onIdp(authorize),
    '/sc16/idp/check': onIdp(check),
    '/sc16/idp/done': onIdp(done),
    '/sc16/callback': callback,
    '/sc16/dashboard': (_req, res, ctx) =>
      loggedIn(ctx, 'sc16')
        ? html(res, page('Dashboard', '<p>Welcome back.</p><a href="/sc16/messages">Messages</a>'))
        : redirect(res, '/sc16/login'),
    '/sc16/messages': (_req, res, ctx) =>
      loggedIn(ctx, 'sc16')
        ? html(res, page('Messages', '<p>No new messages.</p>'))
        : redirect(res, '/sc16/login'),
  },
};
