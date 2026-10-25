// SC-25 (R-80 (4), spec 080 FR-013): a date form without server state. The date field sets no
// limit in the page (no `min`, no `max`), and the server refuses a start date outside its window
// with a message on the same form; nothing is kept between requests (a plain GET form). The
// proving ground's claim wizard (LO-47) keeps its step on the server, so the `date-range` probe had
// no scar of its own for the plain case. The window is fixed (no clock), so the gate never drifts.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const FIRST = '2026-01-01';
const LAST = '2029-12-31';
const MESSAGE = `The policy start date must be between ${FIRST} and ${LAST}.`;

/** True for an ISO date inside the window (ISO dates compare as text). */
const inWindow = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= FIRST && value <= LAST;

const form = (value: string, refused: boolean): string =>
  page(
    'Policy start',
    `${refused ? `<div role="alert"><p>${MESSAGE}</p></div>` : ''}
<form method="get" action="/sc25/" aria-label="Policy start">
<p><label for="start">Policy start date</label> <input id="start" name="start" type="date" required value="${value}"></p>
<button type="submit">Continue</button>
</form>`,
  );

export const sc25: Scar = {
  id: 'SC-25',
  entry: '/sc25/',
  routes: {
    '/sc25/': (_req, res, ctx) => {
      const start = ctx.query.get('start');
      if (start === null) return html(res, form('', false));
      if (!inWindow(start)) return html(res, form(start.replace(/[^0-9-]/g, ''), true));
      return html(res, page('Policy start saved', `<p>Your policy starts on ${start}.</p>`));
    },
  },
};
