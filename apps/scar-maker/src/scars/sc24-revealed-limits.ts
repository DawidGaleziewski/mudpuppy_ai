// SC-24 (F-04@036): the reference calculator's options step in small. A required radio group
// ("Cover", "Basic" chosen) and an option that adds a required number box with limits by script
// ("Comprehensive" → "Vehicle value", 1000–90000). Probes started from the happy values: the
// group was never left empty under its own name, and the box was filled but never probed.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const BOX = `<div id="value-box"><label for="vehicle-value">Vehicle value</label>
<input id="vehicle-value" name="vehicle_value" type="number" required min="1000" max="90000"></div>`;

export const sc24: Scar = {
  id: 'SC-24',
  entry: '/sc24/',
  routes: {
    '/sc24/': (_req, res) =>
      html(
        res,
        page(
          'Cover choice',
          `<form method="get" action="/sc24/result" aria-label="Cover choice">
<fieldset><legend>Cover</legend>
<p><input id="basic" type="radio" name="cover" value="basic" required checked> <label for="basic">Basic</label></p>
<p><input id="comprehensive" type="radio" name="cover" value="comprehensive"> <label for="comprehensive">Comprehensive</label></p>
</fieldset>
<template id="box">${BOX}</template>
<button type="submit">Calculate</button>
</form>
<script>
const form = document.querySelector('form');
for (const r of form.querySelectorAll('input[name=cover]'))
  r.addEventListener('change', function () {
    const box = document.getElementById('value-box');
    const on = document.getElementById('comprehensive').checked;
    if (on && !box) form.querySelector('fieldset').after(document.getElementById('box').content.cloneNode(true));
    if (!on && box) box.remove();
  });
</script>`,
        ),
      ),
    '/sc24/result': (_req, res, ctx) =>
      html(
        res,
        page(
          ctx.query.get('cover') === 'comprehensive' ? 'Comprehensive quote' : 'Basic quote',
          '<p>Your quote is ready.</p>',
        ),
      ),
  },
};
