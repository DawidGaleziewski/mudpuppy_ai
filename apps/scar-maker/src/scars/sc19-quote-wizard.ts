// SC-19 (owner, 2026-10-16, `graph_handler`; spec 032): a quote wizard whose three steps are rendered
// by script on one URL, like a React form. A map run recorded only its happy path: no browser-native
// messages, no other customer type (which leads somewhere else), no failed quote request. The quote
// API validates again (an unknown promo code is a 422 with a field message), and the buy call is the
// irreversible submit.

import { json, page, html } from '../page.js';
import type { Scar } from '../types.js';
import { SC19_SCRIPT } from './sc19-script.js';

const quote = (body: string): { status: number; value: unknown } => {
  let v: Record<string, string>;
  try {
    v = JSON.parse(body) as Record<string, string>;
  } catch {
    return { status: 400, value: { errors: { type: 'The request could not be read.' } } };
  }
  if (v.promo && v.promo.toUpperCase() !== 'WELCOME')
    return { status: 422, value: { errors: { promo: 'Unknown promo code.' } } };
  const base = v.type === 'business' ? 420 : 310;
  return { status: 200, value: { price: v.promo ? base - 30 : base } };
};

export const sc19: Scar = {
  id: 'SC-19',
  entry: '/sc19/',
  routes: {
    '/sc19/': (_req, res) =>
      html(
        res,
        page(
          'Car insurance quote',
          '<p>Three short steps, all on one page.</p><a href="/sc19/apply">Get a quote</a>',
        ),
      ),
    '/sc19/apply': (_req, res) =>
      html(
        res,
        page('Get a quote', `<div id="wizard"></div><script>${SC19_SCRIPT}</script>`),
      ),
    '/sc19/api/quote': (req, res, ctx) => {
      if (req.method !== 'POST') return json(res, { error: 'POST only' }, 405);
      const out = quote(ctx.body);
      json(res, out.value, out.status);
    },
    '/sc19/api/buy': (req, res, ctx) => {
      if (req.method !== 'POST') return json(res, { error: 'POST only' }, 405);
      const n = ((ctx.memory.get('sc19:bought') as number | undefined) ?? 0) + 1;
      ctx.memory.set('sc19:bought', n);
      json(res, { policy: `PL-${String(5000 + n)}` });
    },
  },
};
