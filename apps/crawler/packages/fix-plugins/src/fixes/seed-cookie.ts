// seed-cookie (field H-1, scar SC-08): a portal hides content unless a cookie is set (a feature flag
// the client sets by hand in the browser console). Seed it at run start and again before any page
// load that finds it missing: logging in or a portal's own logout can drop it.

import type { HookContext } from '@mudpuppy/hooks';
import { z } from 'zod';
import { defineFix } from '../define.js';

const Params = z
  .object({
    cookies: z
      .array(
        z
          .object({
            name: z.string().min(1),
            value: z.string(),
            /** The cookie's URL; default the portal's base URL (host and `/`). */
            url: z.url().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const seedCookie = defineFix({
  id: 'seed-cookie',
  summary: 'Content appears only when a cookie (a feature flag) is present: seed it.',
  scars: ['SC-08', 'H-1'],
  params: Params,
  hooks: (p) => {
    const ensure = async (ctx: HookContext): Promise<void> => {
      const present = new Set((await ctx.cookies.get()).map((c) => c.name));
      // Playwright takes `url` or `domain` + `path`, never both (field H-1 lesson): only `url`.
      const missing = p.cookies
        .filter((c) => !present.has(c.name))
        .map((c) => ({ name: c.name, value: c.value, url: c.url ?? ctx.config.base_url }));
      if (missing.length === 0) return;
      await ctx.cookies.add(missing);
      ctx.log(`seeded ${missing.map((c) => c.name).join(', ')}`);
    };
    return { onRunStart: ensure, onBeforePageLoad: ensure };
  },
});
