// The page a message is about (spec 022 R6, FE-A02, FE-A03): "This page" in the drawer sends the
// page's identity with each message; "Whole yard" sends `kind: portal`. The user's text is stored
// as typed; the agent's turn starts with one line that names the page and how to read it.

import { z } from 'zod';

const Id = z.string().trim().min(1).max(200);

export const PageContext = z.object({
  kind: z.enum(['page', 'portal']),
  page: z
    .object({
      type: z.enum(['screen', 'process', 'review', 'scan', 'docs']),
      id: Id,
      /** The revision on screen, when the page shows one (screen r2, process B r3). */
      rev: z.number().int().min(1).optional(),
      /** Ids shown on the page as tags: element keys, amendment keys, record keys. */
      ids: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
      /** Human name of the page, as its title. */
      label: z.string().trim().min(1).max(300).optional(),
    })
    .optional(),
});
export type PageContext = z.infer<typeof PageContext>;

/** The line put before the user's text for the agent, or '' for the whole portal. */
export function contextLine(ctx: PageContext | undefined): string {
  if (ctx === undefined || ctx.kind === 'portal' || ctx.page === undefined) return '';
  const p = ctx.page;
  const rev = p.rev === undefined ? '' : ` r${String(p.rev)}`;
  const label = p.label === undefined ? '' : ` "${p.label}"`;
  const ids = p.ids === undefined || p.ids.length === 0 ? '' : ` On the page: ${p.ids.join(', ')}.`;
  return (
    `[Page context: ${p.type} ${p.id}${rev}${label}.${ids} The BA is looking at this page; read it ` +
    `with page_context before answering about it, and propose changes with propose_change.]\n\n`
  );
}
