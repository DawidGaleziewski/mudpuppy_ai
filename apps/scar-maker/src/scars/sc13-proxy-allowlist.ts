// SC-13 (field GC-03, GC-05): the portal admits only the corporate proxy's egress address; anything
// else gets a 403 "not whitelisted" before any page. scar-maker's forward proxy reaches the portal
// from 127.0.0.3, the only source address admitted here. Portal files: `portals/scar-maker` (no
// proxy: the run stops on the 403 page) and `portals/scar-maker-proxy` (`network.proxy`).

import { html, page } from '../page.js';
import { PROXY_EGRESS } from '../proxy.js';
import type { Handler, Scar } from '../types.js';

const allowlisted =
  (h: Handler): Handler =>
  (req, res, ctx) =>
    req.socket.remoteAddress === PROXY_EGRESS
      ? h(req, res, ctx)
      : html(
          res,
          page('Access denied', '<p>Your address is not whitelisted for this service.</p>'),
          403,
        );

export const sc13: Scar = {
  id: 'SC-13',
  entry: '/sc13/',
  inIndex: false,
  routes: {
    '/sc13/': allowlisted((_req, res) =>
      html(
        res,
        page(
          'Contracts (internal)',
          '<p>Reachable through the corporate proxy only.</p><a href="/sc13/details">Contract details</a>',
        ),
      ),
    ),
    '/sc13/details': allowlisted((_req, res) =>
      html(res, page('Contract details (internal)', '<p>Details.</p>')),
    ),
  },
};
