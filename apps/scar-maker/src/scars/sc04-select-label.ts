// SC-04 (field C-5): a native `<select>` whose option values are server ids, not the visible labels a
// trace author knows ("Household" vs `K-7731`).

import { esc, html, page } from '../page.js';
import type { Scar } from '../types.js';

const options = [
  ['K-7731', 'Household insurance'],
  ['K-9902', 'Liability insurance'],
] as const;

export const sc04: Scar = {
  id: 'SC-04',
  entry: '/sc04/',
  routes: {
    '/sc04/': (_req, res) =>
      html(
        res,
        page(
          'Choose a contract',
          `<form method="get" action="/sc04/result" aria-label="Contract choice">
<label for="contract">Contract</label>
<select id="contract" name="contract">
<option value="">Please choose</option>
${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('\n')}
</select>
<button type="submit">Show</button>
</form>`,
        ),
      ),
    '/sc04/result': (_req, res, ctx) => {
      const id = ctx.query.get('contract') ?? '';
      const label = options.find(([v]) => v === id)?.[1] ?? 'nothing chosen';
      html(
        res,
        page('Contract shown', `<p>Chosen: <strong>${esc(label)}</strong> (${esc(id)})</p>`),
      );
    },
  },
};
