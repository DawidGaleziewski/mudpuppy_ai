// SC-07 (field GC-15, GC-16, GC-18, SQ-3): actions that cannot be done when their turn comes. A
// `javascript:window.open` chat link; a promo link that exists only on the first visit (gone when
// its item is handed out); a "Downloads" link that a layer covers from the second visit on. In the
// field such items were handed out, refused or crashed, handed out again, and `finish_run` refused
// with FRONTIER_NOT_EMPTY: the run was wedged. Deterministic: the start page counts its visits.

import { html, page } from '../page.js';
import type { Handler, Scar } from '../types.js';

const leaf =
  (title: string): Handler =>
  (_req, res) =>
    html(res, page(title, `<p>${title}.</p><a href="/sc07/">Back to the start</a>`));

/** Covers only the Downloads link (a stray promo badge): the click is intercepted. */
const LAYER = `<span id="layer" style="position:absolute;inset:0;background:rgba(0,0,0,.02);z-index:10"></span>`;

const start: Handler = (_req, res, ctx) => {
  const n = ((ctx.memory.get('sc07:visits') as number | undefined) ?? 0) + 1;
  ctx.memory.set('sc07:visits', n);
  html(
    res,
    page(
      'Service start',
      `<ul>
<li><a href="/sc07/news">News</a></li>
<li><a href="/sc07/faq">Questions and answers</a></li>
<li><a href="javascript:window.open('/sc07/chat','chat','width=400,height=600')">Live chat</a></li>
${n === 1 ? '<li><a href="/sc07/promo">Spring promotion</a></li>' : ''}
<li style="position:relative"><a href="/sc07/downloads">Downloads</a>${n > 1 ? LAYER : ''}</li>
</ul>`,
    ),
  );
};

export const sc07: Scar = {
  id: 'SC-07',
  entry: '/sc07/',
  routes: {
    '/sc07/': start,
    '/sc07/news': leaf('News'),
    '/sc07/faq': leaf('Questions and answers'),
    '/sc07/chat': leaf('Live chat'),
    '/sc07/promo': leaf('Spring promotion'),
    '/sc07/downloads': leaf('Downloads'),
  },
};
