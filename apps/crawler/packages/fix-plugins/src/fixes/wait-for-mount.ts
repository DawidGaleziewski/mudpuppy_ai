/// <reference lib="dom" />
// wait-for-mount (field H-3, scar SC-11): a micro-frontend mounts its form after the shell page has
// settled, so the snapshot shows an empty shell and a click lands in nothing. On the pages the portal
// names (`match`), wait for the mount point to be filled before the page is observed and before a
// click. The crawler's own mount wait (spec 015/019) covers mount points it can recognise; this is
// for one whose selector only the owner knows.

import { z } from 'zod';
import { defineFix } from '../define.js';

const Params = z
  .object({
    /** CSS selector that exists once the late content is there, e.g. `#mfe-root form`. */
    selector: z.string().min(1),
    /** Longest wait in the page, ms (keep it under the fix's `timeout_ms`). */
    wait_ms: z.number().int().min(100).max(60_000).default(8000),
  })
  .strict();

/** Polls in the page until `selector` matches or `waitMs` passes; true when it appeared. */
const waitInPage = (selector: string, waitMs: number) =>
  new Promise<boolean>(function (resolve) {
    // The page's monotonic clock: a wall clock that steps must not cut or stretch the wait (spec 036).
    const until = performance.now() + waitMs;
    const tick = function () {
      if (document.querySelector(selector)) return resolve(true);
      if (performance.now() > until) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });

export const waitForMount = defineFix({
  id: 'wait-for-mount',
  summary:
    'Late-mounting content (a micro-frontend form) is waited for before observing or clicking.',
  scars: ['SC-11', 'H-3'],
  params: Params,
  hooks: (p) => ({
    onPageLoad: async (ctx) => {
      const appeared = await ctx.inPage(waitInPage, p.selector, p.wait_ms);
      ctx.log(appeared ? `mounted: ${p.selector}` : `not mounted after ${String(p.wait_ms)} ms`);
    },
    onBeforeClickAction: () => ({ waitFor: p.selector }),
  }),
});
