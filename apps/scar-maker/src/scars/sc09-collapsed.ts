// SC-09 (field H-2 / GC-19): the links of a page live inside closed `<details>`, an
// `aria-expanded="false"` accordion and behind a "Show more" button, all inside the page-wide POST
// form; one toggle also submits the form when clicked (a legacy postback toggle). Unopened, the
// snapshot misses every link. Fixed by the `expand-collapsed` fix-plugin, which must not post the
// form while expanding.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const leaves = ['car', 'home', 'travel', 'pet', 'legal'] as const;

const body = `<form method="post" action="/sc09/posted">
<details><summary>Car</summary><a href="/sc09/car">Car insurance</a></details>
<details><summary>Home</summary><a href="/sc09/home">Home insurance</a></details>
<h2><button type="button" aria-expanded="false" aria-controls="p-travel"
  onclick="var p=document.getElementById('p-travel');p.hidden=!p.hidden;this.setAttribute('aria-expanded',String(!p.hidden));document.forms[0].submit()">Travel</button></h2>
<div id="p-travel" hidden><a href="/sc09/travel">Travel insurance</a></div>
<div id="more" hidden><a href="/sc09/pet">Pet insurance</a> <a href="/sc09/legal">Legal protection</a></div>
<button type="button" onclick="document.getElementById('more').hidden=false;this.remove()">Show more</button>
</form>`;

export const sc09: Scar = {
  id: 'SC-09',
  entry: '/sc09/',
  routes: {
    '/sc09/': (_req, res) => html(res, page('Insurance products', body)),
    // Reached only if a toggle posts the form: the gate checks this was never hit.
    '/sc09/posted': (_req, res, ctx) => {
      ctx.memory.set(
        'sc09:posted',
        ((ctx.memory.get('sc09:posted') as number | undefined) ?? 0) + 1,
      );
      html(res, page('Form posted', '<p>The page form was submitted.</p>'));
    },
    '/__admin/sc09/posted': (_req, res, ctx) =>
      html(res, String((ctx.memory.get('sc09:posted') as number | undefined) ?? 0)),
    ...Object.fromEntries(
      leaves.map((l) => [
        `/sc09/${l}`,
        ((_req, res) =>
          html(
            res,
            page(`${l} insurance`, '<p>Product page.</p>'),
          )) satisfies Scar['routes'][string],
      ]),
    ),
  },
};
