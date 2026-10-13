// The assistant's process tools (spec 022 FR-007, screen 04): read what it needs to cut the portal
// into processes, and suggest a grouping. A suggestion changes nothing until a person accepts it
// in Processes; a dismissed set of screens is refused.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type BetterSqlite3 from 'better-sqlite3';
import { type PathfinderDb } from '@pathfinder/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { suggestGrouping } from './process-suggestions.js';

export interface ProcessToolsContext {
  raw: BetterSqlite3.Database;
  /** The typed store; without it suggest_grouping is not offered (tests of other tools). */
  db: PathfinderDb | null;
  conversationId: string;
}

type Ok = (value: unknown) => CallToolResult;
type Refused = (code: string, message: string, details?: string[]) => CallToolResult;

/** Screens (newest revision of each), the links between them, and what is already cut. */
function groupingInputs(raw: BetterSqlite3.Database, portal: string) {
  const screens = raw
    .prepare(
      `SELECT s.id AS state_id, s.title, s.route_template FROM states s
       WHERE s.portal_id = ?
         AND (s.screen_id IS NULL OR s.screen_rev = (SELECT max(t.screen_rev) FROM states t WHERE t.screen_id = s.screen_id))
       ORDER BY s.route_template, s.title`,
    )
    .all(portal);
  const links = raw
    .prepare(
      `SELECT e.from_state, e.to_state, json_extract(e.action_json, '$.role') AS role,
              json_extract(e.action_json, '$.name') AS name, count(*) AS times
       FROM edges e JOIN states f ON f.id = e.from_state
       WHERE f.portal_id = ? AND e.to_state IS NOT NULL AND e.status = 'executed'
         AND e.from_state <> e.to_state
       GROUP BY e.from_state, e.to_state, role, name ORDER BY e.from_state LIMIT 2000`,
    )
    .all(portal);
  const processes = raw
    .prepare(
      `SELECT p.key, p.name, p.stage, r.steps FROM ba_processes p
       JOIN process_variants v ON v.process_id = p.id AND v.label = 'A'
       JOIN process_variant_revisions r ON r.variant_id = v.id AND r.rev = v.rev
       WHERE p.portal_id = ? ORDER BY p.key`,
    )
    .all(portal) as { key: string; name: string; stage: string; steps: string }[];
  const suggestions = raw
    .prepare(
      `SELECT name, status, screens_key FROM grouping_suggestions
       WHERE portal_id = ? ORDER BY created_at`,
    )
    .all(portal);
  return {
    portal,
    screens,
    links,
    processes: processes.map((p) => ({
      key: p.key,
      name: p.name,
      stage: p.stage,
      state_ids: (JSON.parse(p.steps) as { state_id: string | null }[]).map((s) => s.state_id),
    })),
    suggestions,
  };
}

export function registerProcessTools(
  server: McpServer,
  ctx: ProcessToolsContext,
  ok: Ok,
  refused: Refused,
): void {
  server.registerTool(
    'list_grouping_inputs',
    {
      description:
        "What you need to cut a portal into processes: its recorded screens (newest revision of each: state_id, title, route), the links the scans followed between them (from_state → to_state with the link's role and name), the BA's saved processes with their as-is screens, and earlier suggestions with their status (never suggest a dismissed set of screens again). Read only.",
      inputSchema: { portal: z.string() },
    },
    ({ portal }) => {
      try {
        return ok(groupingInputs(ctx.raw, portal));
      } catch {
        return refused('INTERNAL', 'internal error in pathfinder-chat; the chat service logs it');
      }
    },
  );

  const db = ctx.db;
  if (db === null) return;
  server.registerTool(
    'suggest_grouping',
    {
      description:
        'Suggest one process: a name the BA would use, the persona the screens were recorded as, the state_ids in the order a person walks them (start first, end last), and why (the links or menu entries that tie them, quoted). It shows in Processes as "Suggested by the assistant" with Accept / Edit first / Dismiss; nothing is saved until the BA accepts. Refused when the BA dismissed or already has the same set of screens.',
      inputSchema: {
        portal: z.string(),
        name: z.string(),
        persona: z.string(),
        state_ids: z.array(z.string()).min(1),
        why: z.string(),
      },
    },
    async ({ portal, ...body }) => {
      try {
        const s = await suggestGrouping(db, portal, ctx.conversationId, body);
        return ok({
          suggestion: { id: s.id, name: s.name, status: s.status, screens: s.steps.length },
        });
      } catch (error) {
        if (error instanceof HttpError) {
          const code = typeof error.extra['code'] === 'string' ? error.extra['code'] : 'REFUSED';
          return refused(code, error.message);
        }
        return refused('INTERNAL', 'internal error in pathfinder-chat; the chat service logs it');
      }
    },
  );
}
