// SC-15 (field GC-08): an SPA login whose form exists only after its bundle loaded ~300 chunk
// scripts one after another. At a polite rate that takes many seconds, longer than a fixed login
// wait, so the login reported `control_not_found` while the page was loading fine. Portal file:
// `portals/scar-maker-slow`.

import { html, page, redirect, text } from '../page.js';
import type { Handler, Scar } from '../types.js';
import { credentialsOk, loggedIn, openSession, sessionCookie } from './login-session.js';

/** At the gates' 20 requests per second this is ~15 s, well past the old fixed waits (~7.5 s). */
export const CHUNKS = 300;

const FORM = `<form method="post" action="/sc15/login" aria-label="Sign in">
<label for="u">User name</label><input id="u" name="u">
<label for="p">Password</label><input id="p" name="p" type="password">
<button type="submit">Sign in</button></form>`;

const shell = `<div id="app">Loading…</div>
<script>
(function next(n) {
  if (n > ${String(CHUNKS)}) { document.getElementById('app').innerHTML = ${JSON.stringify(FORM)}; return; }
  var s = document.createElement('script');
  s.src = '/sc15/chunk?n=' + n;
  s.onload = function () { next(n + 1); };
  document.head.appendChild(s);
})(1);
</script>`;

const chunk: Handler = (_req, res, ctx) => {
  res.setHeader('cache-control', 'no-store');
  text(res, `/* chunk ${ctx.query.get('n') ?? '?'} */`, 200, 'text/javascript');
};

const login: Handler = (req, res, ctx) => {
  if (req.method !== 'POST') return html(res, page('Sign in', shell));
  const f = new URLSearchParams(ctx.body);
  if (!credentialsOk(f.get('u'), f.get('p')))
    return html(res, page('Sign in', `<p role="alert">Wrong user name or password.</p>${FORM}`));
  redirect(res, '/sc15/home', 303, sessionCookie('sc15', openSession(ctx, 'sc15')));
};

export const sc15: Scar = {
  id: 'SC-15',
  entry: '/sc15/login',
  routes: {
    '/sc15/login': login,
    '/sc15/chunk': chunk,
    '/sc15/home': (_req, res, ctx) =>
      loggedIn(ctx, 'sc15')
        ? html(res, page('Welcome', '<p>Welcome back.</p>'))
        : redirect(res, '/sc15/login'),
  },
};
