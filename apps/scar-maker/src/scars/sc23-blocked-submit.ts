// SC-23 (F-11@034): a page-load form whose submit gets no document (blocked or lost on the way).
// Chromium then shows its own error page, `chrome-error://chromewebdata/`, whose path is `/`: the
// crawler recorded it as a blank screen of the home page, the destination of every "Next".

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

export const sc23: Scar = {
  id: 'SC-23',
  entry: '/sc23/',
  routes: {
    '/sc23/': (_req, res) =>
      html(
        res,
        page(
          'Find a branch',
          `<form method="get" action="/sc23/branches" aria-label="Branch search">
<label for="city">City</label>
<input id="city" name="city" value="Springfield">
<button type="submit">Next</button>
</form>`,
        ),
      ),
    '/sc23/branches': (_req, res) => html(res, page('Branches', '<p>Main Street 1</p>')),
  },
};
