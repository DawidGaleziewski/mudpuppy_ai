// SC-14 (field C-6): a login form bound to a framework model that takes a value only on `change`
// and `blur` (a reactive form updating on blur). The page sends the model, not the DOM: a value set
// without those events leaves the model empty and the login is rejected, although the form looks
// filled. Its button keeps the focus on mousedown (common in SPA widgets), so clicking it never
// blurs the password field: a plain `fill()` (only an `input` event) leaves the password out of the
// model. Portal file: `portals/scar-maker-bound`.

import { html, json, page, redirect } from '../page.js';
import type { Handler, Scar } from '../types.js';
import { credentialsOk, loggedIn, openSession, sessionCookie } from './login-session.js';

const form = `<form id="login" aria-label="Sign in">
<label for="user">User name</label><input id="user" autocomplete="off">
<label for="pass">Password</label><input id="pass" type="password">
<p id="msg" role="alert"></p>
<button type="submit" onmousedown="event.preventDefault()">Sign in</button>
</form>
<script>
var model = { user: '', pass: '' };
['user', 'pass'].forEach(function (k) {
  var el = document.getElementById(k);
  // Updated only on change and blur, never on input (the framework's "updateOn: blur").
  el.addEventListener('change', function () { model[k] = el.value; });
  el.addEventListener('blur', function () { model[k] = el.value; });
});
document.getElementById('login').addEventListener('submit', function (e) {
  e.preventDefault();
  fetch('/sc14/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(model) })
    .then(function (r) {
      if (r.ok) location.href = '/sc14/home';
      else document.getElementById('msg').textContent = 'Wrong user name or password.';
    });
});
</script>`;

const api: Handler = (_req, res, ctx) => {
  const body = JSON.parse(ctx.body || '{}') as { user?: string; pass?: string };
  if (!credentialsOk(body.user ?? null, body.pass ?? null))
    return json(res, { error: 'rejected' }, 401);
  const id = openSession(ctx, 'sc14');
  res.writeHead(200, { 'content-type': 'application/json', ...sessionCookie('sc14', id) });
  res.end('{"ok":true}');
};

export const sc14: Scar = {
  id: 'SC-14',
  entry: '/sc14/login',
  routes: {
    '/sc14/login': (_req, res) => html(res, page('Sign in', form)),
    '/sc14/api/login': api,
    '/sc14/home': (_req, res, ctx) =>
      loggedIn(ctx, 'sc14')
        ? html(
            res,
            page('Welcome', '<p>Welcome back. <a href="/sc14/contracts">Your contracts</a></p>'),
          )
        : redirect(res, '/sc14/login'),
    '/sc14/contracts': (_req, res, ctx) =>
      loggedIn(ctx, 'sc14')
        ? html(res, page('Your contracts', '<p>Two contracts.</p>'))
        : redirect(res, '/sc14/login'),
  },
};
