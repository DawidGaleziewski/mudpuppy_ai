// SC-03 (field C-7): legacy links whose href is not a URL: a `javascript:` postback that submits the
// page's GET form, plus `mailto:` and `tel:` links. Route-template inference must not parse them.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

export const sc03: Scar = {
  id: 'SC-03',
  entry: '/sc03/',
  routes: {
    '/sc03/': (_req, res) =>
      html(
        res,
        page(
          'Step 1 of 2',
          `<form name="step" method="get" action="/sc03/step-2">
<input type="hidden" name="from" value="1">
<p>Read the conditions, then go on.</p>
<a href="javascript:document.forms.step.submit()">Next step</a>
</form>
<p><a href="mailto:service@example.invalid">Write to the service</a>
<a href="tel:+490000000">Call the hotline</a></p>`,
        ),
      ),
    '/sc03/step-2': (_req, res, ctx) =>
      html(
        res,
        page(
          'Step 2 of 2',
          `<p>Arrived from step ${ctx.query.get('from') ?? '?'}.</p><a href="/sc03/">Back</a>`,
        ),
      ),
  },
};
