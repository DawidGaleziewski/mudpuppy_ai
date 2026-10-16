/// <reference lib="dom" />
// expand-collapsed (field H-2 / GC-19, scars SC-09 and SC-10): links and fields inside closed
// accordions, `<details>` and "show more" toggles are missing from the snapshot and the screenshot.
// Open them after the page settles, with the field's rails: form submits are suppressed while
// expanding (a toggle inside a page-wide form must not post the page away), only a toggle whose
// panel is really hidden is clicked (clicking an open section header closes it: a page dropped from
// ~20 links to ~2 in the field), real links, submits, pop-up openers and disabled controls are never
// clicked, and the number of expansions is capped.

import { z } from 'zod';
import { defineFix } from '../define.js';

const Params = z
  .object({
    max: z.number().int().min(1).max(500).default(60),
    /** CSS selectors of toggles (or their containers) never to touch. */
    exclude: z.array(z.string().min(1)).default([]),
    /** Extra CSS selectors of toggles, e.g. section-header links `dl dt > a[href="#"]`. */
    toggles: z.array(z.string().min(1)).default([]),
    /** Visible texts of "show more" controls (any case, whole text). */
    show_more: z
      .array(z.string().min(1))
      .default(['show more', 'mehr anzeigen', 'pokaż więcej', 'więcej', 'load more']),
  })
  .strict();

/**
 * Runs in the page. Kept to anonymous function expressions: a hook body is serialised into the page
 * (spec 030 FR-033 adds the `__name` shim, this keeps it independent of that too).
 */
const expandInPage = (max: number, exclude: string[], toggles: string[], showMore: string[]) => {
  const proto = HTMLFormElement.prototype;
  // Kept to be put back on the prototype unchanged, never called detached.
  const submit = proto.submit; // eslint-disable-line @typescript-eslint/unbound-method -- restored onto the prototype below
  const requestSubmit = proto.requestSubmit; // eslint-disable-line @typescript-eslint/unbound-method -- restored onto the prototype below
  const block = function (e: Event) {
    e.preventDefault();
  };
  proto.submit = function () {};
  proto.requestSubmit = function () {};
  document.addEventListener('submit', block, true);
  let count = 0;
  const skip = function (el: Element) {
    if (el.matches('[disabled], [aria-disabled="true"], [type=submit], select, [aria-haspopup]'))
      return true;
    if (el.matches('a[href]') && !/^(#|javascript:)/i.test(el.getAttribute('href') ?? ''))
      return true;
    return exclude.some(function (sel) {
      try {
        return el.closest(sel) !== null;
      } catch {
        return false;
      }
    });
  };
  const hidden = function (el: Element | null) {
    if (!el) return true;
    if ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true') return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || el.getClientRects().length === 0;
  };
  const panelOf = function (t: Element) {
    const id = t.getAttribute('aria-controls');
    if (id) return document.getElementById(id);
    const dt = t.closest('dt');
    return dt ? dt.nextElementSibling : t.nextElementSibling;
  };
  try {
    document.querySelectorAll('details:not([open])').forEach(function (d) {
      if (count < max && !skip(d)) {
        (d as HTMLDetailsElement).open = true;
        count++;
      }
    });
    const selector = ['[aria-expanded="false"]'].concat(toggles).join(', ');
    document.querySelectorAll(selector).forEach(function (t) {
      if (count >= max || skip(t) || !hidden(panelOf(t))) return;
      (t as HTMLElement).click();
      count++;
    });
    const texts = showMore.map(function (s) {
      return s.toLowerCase();
    });
    document
      .querySelectorAll('button, [role=button], a[href="#"], a:not([href])')
      .forEach(function (b) {
        const label = (b.textContent ?? '').trim().toLowerCase();
        if (count >= max || skip(b) || texts.indexOf(label) < 0) return;
        (b as HTMLElement).click();
        count++;
      });
  } finally {
    proto.submit = submit;
    proto.requestSubmit = requestSubmit;
    document.removeEventListener('submit', block, true);
  }
  return count;
};

export const expandCollapsed = defineFix({
  id: 'expand-collapsed',
  summary: 'Content inside closed accordions and "show more" toggles is opened before observing.',
  scars: ['SC-09', 'SC-10', 'H-2', 'GC-19'],
  params: Params,
  hooks: (p) => ({
    onPageLoad: async (ctx) => {
      const opened = await ctx.inPage(expandInPage, p.max, p.exclude, p.toggles, p.show_more);
      if (opened > 0) ctx.log(`expanded ${String(opened)} collapsed section(s)`);
    },
  }),
});
