// SC-08 (field H-1): the service list renders only with a feature-flag cookie that the client sets
// by hand in the browser console; without it the page says there is nothing to show (a hollow screen).
// Fixed by the `seed-cookie` fix-plugin.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

export const FLAG_COOKIE = 'sm_show_services';

const SERVICES = ['Change address', 'Report a claim', 'Order a document'];

export const sc08: Scar = {
  id: 'SC-08',
  entry: '/sc08/',
  routes: {
    '/sc08/': (_req, res, ctx) =>
      html(
        res,
        page(
          'Services',
          ctx.cookies[FLAG_COOKIE] === '1'
            ? `<ul>${SERVICES.map((s, i) => `<li><a href="/sc08/service-${i + 1}">${s}</a></li>`).join('')}</ul>`
            : '<p>Nothing to show.</p>',
        ),
      ),
    ...Object.fromEntries(
      SERVICES.map((s, i) => [
        `/sc08/service-${i + 1}`,
        ((_req, res) => html(res, page(s, `<p>${s}.</p>`))) satisfies Scar['routes'][string],
      ]),
    ),
  },
};
