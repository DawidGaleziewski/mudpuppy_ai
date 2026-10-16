// SC-10 (field H-2, the non-obvious bug): section headers `dl dt > a[href="#"]` toggle their `dd`;
// two sections are open by default, one is closed. A naive "click every toggle" closes the open
// ones (in the field a page dropped from ~20 service links to ~2). Only the closed one may be clicked.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const sections = [
  { title: 'Contracts', open: true, links: ['Contract overview', 'Contract changes'] },
  { title: 'Claims', open: true, links: ['Open claims', 'Claim history'] },
  { title: 'Documents', open: false, links: ['Tax certificate', 'Policy documents'] },
];

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

const body = `<dl>
${sections
  .map(
    (
      s,
    ) => `<dt><a href="#" onclick="var d=this.parentNode.nextElementSibling;d.hidden=!d.hidden;return false">${s.title}</a></dt>
<dd${s.open ? '' : ' hidden'}>${s.links.map((l) => `<a href="/sc10/${slug(l)}">${l}</a>`).join(' ')}</dd>`,
  )
  .join('\n')}
</dl>`;

export const sc10: Scar = {
  id: 'SC-10',
  entry: '/sc10/',
  routes: {
    '/sc10/': (_req, res) => html(res, page('My services', body)),
    ...Object.fromEntries(
      sections
        .flatMap((s) => s.links)
        .map((l) => [
          `/sc10/${slug(l)}`,
          ((_req, res) => html(res, page(l, `<p>${l}.</p>`))) satisfies Scar['routes'][string],
        ]),
    ),
  },
};
