/// <reference lib="dom" />
// detect-stack (field H-4): a portal mixes a modern SPA shell with legacy server-rendered pages, and
// the team wants each screen tagged as one or the other (a migration inventory). Read-only: it looks
// for the SPA's mount container and for legacy markers the owner names, and logs a verdict on the
// page's hook run (decision log), which the BA and the dashboard read.

import { z } from 'zod';
import { defineFix } from '../define.js';

const Params = z
  .object({
    /** CSS selectors whose presence means the SPA rendered this page (its mount container). */
    spa: z.array(z.string().min(1)).min(1),
    /** CSS selectors of legacy markers (a hidden server-state field, a CMS wrapper). */
    legacy: z.array(z.string().min(1)).default([]),
  })
  .strict();

const inspect = (spa: string[], legacy: string[]) => ({
  spa: spa.some(function (s) {
    return document.querySelector(s) !== null;
  }),
  legacy: legacy.filter(function (s) {
    return document.querySelector(s) !== null;
  }),
});

export const detectStack = defineFix({
  id: 'detect-stack',
  summary: 'Tags every page as SPA or legacy (read-only), for a migration inventory.',
  scars: ['H-4'],
  params: Params,
  hooks: (p) => ({
    onPageLoad: async (ctx) => {
      const r = await ctx.inPage(inspect, p.spa, p.legacy);
      ctx.log(
        r.spa
          ? 'stack: spa'
          : `stack: legacy${r.legacy.length > 0 ? ` (${r.legacy.join(', ')})` : ''}`,
      );
    },
  }),
});
