// SC-17 (owner, 2026-10-15): a portal whose pages intermittently answer an error page: a 503, a 500
// error page, or a 200 page that only says a technical error happened (a "soft" error). Most visits
// are fine. Deterministic so a gate is stable: the first visit of every item page fails (each item
// with another kind), later visits work; the hub fails on its second visit only, so a revisit of a
// good screen meets an error too. The harness must retry or mark the visit as a transient error and
// never let an error page stand in for, or replace, the real screen.

import { html, page } from '../page.js';
import type { Handler, Scar, ScarContext } from '../types.js';

const ITEMS = ['Policies', 'Claims', 'Documents', 'Payments', 'Messages', 'Profile'] as const;

type Kind = 'http_503' | 'http_500' | 'soft_200';
const KINDS: readonly Kind[] = ['http_503', 'http_500', 'soft_200'];

function visit(ctx: ScarContext): number {
  const key = `sc17:${ctx.path}`;
  const n = ((ctx.memory.get(key) as number | undefined) ?? 0) + 1;
  ctx.memory.set(key, n);
  return n;
}

const errorPage: Record<Kind, { status: number; title: string; body: string }> = {
  http_503: {
    status: 503,
    title: 'Service temporarily unavailable',
    body: '<p>The service is temporarily unavailable. Please try again in a moment.</p>',
  },
  http_500: {
    status: 500,
    title: 'Internal error',
    body: '<p>An unexpected error occurred (reference 7f3a). Please try again later.</p>',
  },
  soft_200: {
    status: 200,
    title: 'Error',
    body: '<p role="alert">A technical error has occurred. Please try again later.</p>',
  },
};

const fail: (kind: Kind) => Handler = (kind) => (_req, res) => {
  const e = errorPage[kind];
  // Retry-After only where a real server would send it.
  html(res, page(e.title, e.body), e.status, kind === 'http_503' ? { 'retry-after': '1' } : {});
};

const hubBody = `<p>Your customer area.</p>
<ul>${ITEMS.map((name, i) => `<li><a href="/sc17/item-${i + 1}">${name}</a></li>`).join('\n')}</ul>`;

const item =
  (i: number): Handler =>
  (req, res, ctx) => {
    if (visit(ctx) === 1) return fail(KINDS[i % KINDS.length]!)(req, res, ctx);
    html(
      res,
      page(
        ITEMS[i]!,
        `<p>${ITEMS[i]} overview with ${i + 2} entries.</p>
<table><tr><th>Entry</th><th>Status</th></tr>
${Array.from({ length: i + 2 }, (_, k) => `<tr><td>${ITEMS[i]} ${k + 1}</td><td>active</td></tr>`).join('\n')}
</table>
<a href="/sc17/">Back to the customer area</a>`,
      ),
    );
  };

export const sc17: Scar = {
  id: 'SC-17',
  entry: '/sc17/',
  routes: {
    '/sc17/': (req, res, ctx) =>
      visit(ctx) === 2
        ? fail('soft_200')(req, res, ctx)
        : html(res, page('Customer area', hubBody)),
    ...Object.fromEntries(ITEMS.map((_, i) => [`/sc17/item-${i + 1}`, item(i)])),
  },
};
