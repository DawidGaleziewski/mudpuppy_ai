// The assistant's page tools in the `pathfinder-chat` MCP server (spec 022 R6, FE-A03, FE-A07):
// read the page the BA is looking at, highlight an element on a recorded screen, open a page.
// The two browser tools only validate and answer; the chat service turns their completed calls
// into `ui_action` events (ui-actions.ts). Changes are proposed with propose_change
// (mcp-chat.ts, proposals.ts) and applied by a person.

import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type BetterSqlite3 from 'better-sqlite3';
import { Layout, type EvidenceStore } from '@pathfinder/core';
import { z } from 'zod';

export interface PageToolContext {
  raw: BetterSqlite3.Database;
  evidence: EvidenceStore | null;
}

type Reply = (value: unknown) => CallToolResult;
type Refuse = (code: string, message: string) => CallToolResult;

function elementsOf(evidence: EvidenceStore | null, layoutRef: string | null) {
  if (evidence === null || layoutRef === null) return [];
  try {
    const layout = Layout.parse(JSON.parse(readFileSync(evidence.resolve(layoutRef), 'utf8')));
    return layout.elements.map((e) => ({ key: e.key, role: e.role, name: e.name }));
  } catch {
    return [];
  }
}

interface StateRow {
  id: string;
  portal_id: string;
  title: string;
  route_template: string;
  cluster_id: string;
  layout_ref: string | null;
  screen_id: string | null;
  screen_rev: number | null;
}

/** A screen page: the state shown, its screen's revisions, elements, amendments, citing records. */
function screenContext(ctx: PageToolContext, stateId: string): Record<string, unknown> | null {
  const state = ctx.raw
    .prepare(
      `SELECT id, portal_id, title, route_template, cluster_id, layout_ref, screen_id, screen_rev
       FROM states WHERE id = ?`,
    )
    .get(stateId) as StateRow | undefined;
  if (state === undefined) return null;
  const revisions =
    state.screen_id === null
      ? []
      : ctx.raw
          .prepare(
            `SELECT s.id AS state_id, s.screen_rev AS rev, s.title,
                    (SELECT group_concat(o.run_id) FROM state_observations o WHERE o.state_id = s.id) AS seen_by
             FROM states s WHERE s.screen_id = ? ORDER BY s.screen_rev`,
          )
          .all(state.screen_id);
  const amendments = ctx.raw
    .prepare(
      `SELECT id, key, rev, status, target_kind, target_id, kind, text, superseded_detail
       FROM amendments WHERE portal_id = ? AND (target_id = ? OR target_id LIKE ? ESCAPE '\\'
         OR (screen_id IS NOT NULL AND screen_id = ?))
       ORDER BY key`,
    )
    .all(state.portal_id, state.id, `${state.id.replace(/[%_\\]/g, '\\$&')}#%`, state.screen_id);
  const records = ctx.raw
    .prepare(
      `SELECT DISTINCT r.key, r.kind, r.title FROM doc_evidence_links l
       JOIN doc_revisions v ON v.id = l.revision_id JOIN doc_records r ON r.id = v.record_id
       WHERE l.target_id = ? AND v.rev_no = r.latest_rev ORDER BY r.key`,
    )
    .all(state.id);
  return {
    type: 'screen',
    state: {
      id: state.id,
      portal: state.portal_id,
      title: state.title,
      route_template: state.route_template,
      cluster: state.cluster_id,
      revision: state.screen_rev,
    },
    revisions,
    elements: elementsOf(ctx.evidence, state.layout_ref),
    amendments,
    cited_by: records,
  };
}

export function registerPageTools(
  server: McpServer,
  ctx: PageToolContext,
  ok: Reply,
  refused: Refuse,
): void {
  server.registerTool(
    'page_context',
    {
      description:
        'Read the page the BA is looking at (the "[Page context: …]" line names it). For a screen: the recorded state, the revisions of its screen with the scans that saw each, its elements (keys for highlight_element), its amendments with revision numbers, and the records that cite it. Read only.',
      inputSchema: {
        type: z.enum(['screen']).describe('page type from the context line'),
        id: z.string().describe('the id from the context line (for a screen: the state id)'),
      },
    },
    ({ id }) => {
      try {
        const page = screenContext(ctx, id);
        return page === null ? refused('NOT_FOUND', `no recorded screen ${id}`) : ok(page);
      } catch {
        return refused('INTERNAL', 'internal error in pathfinder-chat; the chat service logs it');
      }
    },
  );

  server.registerTool(
    'highlight_element',
    {
      description:
        'Mark an element on the recorded screenshot the BA is looking at, so they see what you mean (the drawer draws "Marked by assistant"). Use an element key from page_context; without one the whole screen is marked. Changes nothing.',
      inputSchema: {
        state_id: z.string(),
        element_key: z.string().optional(),
        label: z.string().max(80).optional(),
      },
    },
    ({ state_id, element_key }) => {
      const row = ctx.raw.prepare('SELECT layout_ref FROM states WHERE id = ?').get(state_id) as
        { layout_ref: string | null } | undefined;
      if (row === undefined) return refused('NOT_FOUND', `no recorded screen ${state_id}`);
      if (
        element_key !== undefined &&
        !elementsOf(ctx.evidence, row.layout_ref).some((e) => e.key === element_key)
      )
        return refused('NOT_FOUND', `screen ${state_id} has no element ${element_key}`);
      return ok({ highlighted: { state_id, element_key: element_key ?? null } });
    },
  );

  server.registerTool(
    'open_page',
    {
      description:
        'Open a dashboard page for the BA, e.g. /states/<id>, /docs/<portal>/<key>, /runs/<id>, /screens, /search?q=…. Only dashboard paths; the BA can always go back.',
      inputSchema: { path: z.string().regex(/^\/[a-z]/, 'a dashboard path starting with /') },
    },
    ({ path }) => ok({ opened: path }),
  );
}
