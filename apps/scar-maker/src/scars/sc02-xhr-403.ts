// SC-02 (field C-1): a SPA page fires a background data call that answers 403 while the page itself
// renders fine. Only a 403 *page* (the main document) means access refused. `/sc02/forbidden` is
// that page; nothing links to it (a map would end there), its gate opens it directly.

import { html, json, page } from '../page.js';
import type { Scar } from '../types.js';

const script = `<script>
fetch('/sc02/api/flags').then(function (r) {
  document.getElementById('flags').textContent = r.ok ? 'flags loaded' : 'flags unavailable (' + r.status + ')';
});
</script>`;

export const sc02: Scar = {
  id: 'SC-02',
  entry: '/sc02/',
  routes: {
    '/sc02/': (_req, res) =>
      html(
        res,
        page(
          'Dashboard',
          `<p id="flags">loading flags…</p>
<a href="/sc02/details">Contract details</a>
${script}`,
        ),
      ),
    '/sc02/api/flags': (_req, res) => json(res, { error: 'feature flags are not for you' }, 403),
    '/sc02/details': (_req, res) =>
      html(res, page('Contract details', '<p>Details of a contract.</p><a href="/sc02/">Back</a>')),
    '/sc02/forbidden': (_req, res) =>
      html(res, page('Access denied', '<p>You may not open this page.</p>'), 403),
  },
};
