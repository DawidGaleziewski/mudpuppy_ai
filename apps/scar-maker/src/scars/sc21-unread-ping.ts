// SC-21 (F-13@034): a page that fires requests and never reads the answers: an analytics ping
// answered with JSON nobody reads, and a beacon answered 204 No Content. Real sites do this on every
// page; the settle must not wait for them, and a 204 is an answer, not a failed request.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

export const sc21: Scar = {
  id: 'SC-21',
  entry: '/sc21/',
  routes: {
    '/sc21/': (_req, res) =>
      html(
        res,
        page(
          'Opening hours',
          `<p>Monday to Friday, 8:00 to 18:00.</p>
<script>
fetch('/sc21/ping?page=hours');
fetch('/sc21/beacon', { method: 'POST', body: '{"event":"view"}' });
</script>`,
        ),
      ),
    '/sc21/ping': (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"received":true}');
    },
    '/sc21/beacon': (_req, res) => {
      res.writeHead(204);
      res.end();
    },
  },
};
