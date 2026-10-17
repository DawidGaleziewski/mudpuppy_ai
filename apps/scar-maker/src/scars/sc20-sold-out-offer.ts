// SC-20 (spec 033, owner input graph_handler: "the same page came out differently across runs"):
// the same button leads to the offer on one visit and to a "sold out today" page on the next, so
// two scans record two outcomes of one action. Deterministic for a gate: odd presses (counted per
// server, reset with `/__admin/reset`) show the offer, even presses the sold-out page. Before, the
// BA documented whichever page its runs held; after, the outcomes are one differing-states group
// with their scans, and the BA proposes a verdict per outcome for the owner to confirm.

import { html, page } from '../page.js';
import type { Scar, ScarContext } from '../types.js';

function press(ctx: ScarContext): number {
  const n = ((ctx.memory.get('sc20:press') as number | undefined) ?? 0) + 1;
  ctx.memory.set('sc20:press', n);
  return n;
}

export const sc20: Scar = {
  id: 'SC-20',
  entry: '/sc20/',
  routes: {
    '/sc20/': (_req, res) =>
      html(
        res,
        page(
          "Today's offer",
          `<p>One garden set at a special price, while stocks last.</p>
<form method="get" action="/sc20/deal"><button type="submit">See the offer</button></form>`,
        ),
      ),
    '/sc20/deal': (_req, res, ctx) => {
      res.statusCode = 303;
      res.setHeader('location', press(ctx) % 2 === 1 ? '/sc20/offer' : '/sc20/sold-out');
      res.end();
    },
    '/sc20/offer': (_req, res) =>
      html(
        res,
        page(
          'Garden set offer',
          '<p>Garden set, 4 chairs and a table: 799 zł instead of 1099 zł.</p><a href="/sc20/">Back</a>',
        ),
      ),
    '/sc20/sold-out': (_req, res) =>
      html(
        res,
        page(
          'Sold out today',
          '<p>Today\'s offer is sold out. A new offer starts tomorrow at 8:00.</p><a href="/sc20/">Back</a>',
        ),
      ),
  },
};
