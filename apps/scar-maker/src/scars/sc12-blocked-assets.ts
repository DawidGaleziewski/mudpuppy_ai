// SC-12 (field GC-13, SQ-4): the page's stylesheet and one script come from a CDN host that the
// corporate proxy refuses (here: the second host answers 403). The page renders unstyled and a
// widget never appears, and the screenshot shows it. The state must carry a render warning naming
// the failed assets, so nobody documents the broken look as the portal's design.

import { html, page, text } from '../page.js';
import type { Handler, Scar } from '../types.js';

const head = (cdn: string) =>
  `<link rel="stylesheet" href="${cdn}/sc12/cdn/theme.css"><script src="${cdn}/sc12/cdn/widget.js"></script>`;

const refused: Handler = (_req, res, ctx) =>
  ctx.host === 'second'
    ? text(res, 'Access denied by proxy policy', 403)
    : text(res, 'not here', 404);

export const sc12: Scar = {
  id: 'SC-12',
  entry: '/sc12/',
  routes: {
    '/sc12/': (_req, res, ctx) =>
      html(
        res,
        page(
          'Account overview',
          '<p class="card">Your balance and contracts.</p><a href="/sc12/details">Details</a>',
          head(ctx.second),
        ),
      ),
    '/sc12/details': (_req, res) => html(res, page('Details', '<p>No external assets here.</p>')),
    '/sc12/cdn/theme.css': refused,
    '/sc12/cdn/widget.js': refused,
  },
};
