// SC-22 (F-12@034): a form whose extra box is in the page from the start and only hidden; choosing
// "Comprehensive" shows it. The crawler kept every control of a form, so the hidden box counted as
// a field of every state.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

export const sc22: Scar = {
  id: 'SC-22',
  entry: '/sc22/',
  routes: {
    '/sc22/': (_req, res) =>
      html(
        res,
        page(
          'Cover options',
          `<form method="get" action="/sc22/result" aria-label="Cover options">
<label for="make">Make</label>
<input id="make" name="make">
<fieldset><legend>Cover</legend>
<label><input type="radio" name="cover" value="liability" checked> Liability only</label>
<label><input type="radio" name="cover" value="comprehensive"> Comprehensive</label>
</fieldset>
<div id="value-box" hidden>
<label for="vehicle-value">Vehicle value</label>
<input id="vehicle-value" name="vehicle_value" type="number" min="1000">
</div>
<button type="submit">Continue</button>
</form>
<script>
for (const r of document.querySelectorAll('input[name=cover]'))
  r.addEventListener('change', function () {
    document.getElementById('value-box').hidden = r.value !== 'comprehensive' || !r.checked;
  });
</script>`,
        ),
      ),
    '/sc22/result': (_req, res) => html(res, page('Cover chosen', '<p>Thank you.</p>')),
  },
};
