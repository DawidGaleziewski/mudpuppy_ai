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
import { REF_NAME } from './ui-actions.js';

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

/** A doc record page: the record, its newest revision's content and what that revision cites. */
function docsContext(ctx: PageToolContext, recordId: string): Record<string, unknown> | null {
  const record = ctx.raw
    .prepare(
      `SELECT r.id, r.portal_id, r.kind, r.key, r.title, r.latest_rev, r.confirmed_rev, r.withdrawn,
              v.id AS revision_id, v.status, v.confidence, v.content_json, v.change_note
       FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.id = ?`,
    )
    .get(recordId) as
    (Record<string, unknown> & { revision_id: string; content_json: string }) | undefined;
  if (record === undefined) return null;
  const { revision_id, content_json, ...rest } = record;
  const evidence = ctx.raw
    .prepare(
      'SELECT target_kind, target_id, run_id, region FROM doc_evidence_links WHERE revision_id = ?',
    )
    .all(revision_id);
  return { type: 'docs', record: rest, content: JSON.parse(content_json) as unknown, evidence };
}

/** A scan page: the run and how much it recorded. */
function scanContext(ctx: PageToolContext, runId: string): Record<string, unknown> | null {
  const run = ctx.raw
    .prepare(
      `SELECT id, portal_id, persona_id, mode, environment, status, started_at, ended_at,
              (SELECT count(*) FROM state_observations o WHERE o.run_id = runs.id) AS screens_seen,
              (SELECT count(*) FROM actions a WHERE a.run_id = runs.id) AS actions
       FROM runs WHERE id = ?`,
    )
    .get(runId);
  return run === undefined ? null : { type: 'scan', run };
}

/**
 * A process page (spec 022 M5): `<process id>:<variant label>`. The process, every variant with
 * its newest steps, and the live marker per environment.
 */
function processContext(ctx: PageToolContext, ref: string): Record<string, unknown> | null {
  const [id, label] = ref.split(':');
  const process = ctx.raw
    .prepare('SELECT id, portal_id, key, name, persona, stage, rev FROM ba_processes WHERE id = ?')
    .get(id);
  if (process === undefined) return null;
  const variants = (
    ctx.raw
      .prepare(
        `SELECT v.label, v.kind, v.rev, r.steps, r.author, r.created_at FROM process_variants v
         JOIN process_variant_revisions r ON r.variant_id = v.id AND r.rev = v.rev
         WHERE v.process_id = ? ORDER BY length(v.label), v.label`,
      )
      .all(id) as (Record<string, unknown> & { steps: string })[]
  ).map((v) => ({ ...v, steps: JSON.parse(v.steps) as unknown }));
  const live = ctx.raw
    .prepare(
      `SELECT l.environment, v.label, l.variant_rev, l.author, l.created_at FROM process_live l
       JOIN process_variants v ON v.id = l.variant_id
       WHERE l.process_id = ? AND l.created_at = (SELECT max(m.created_at) FROM process_live m
         WHERE m.process_id = l.process_id AND m.environment = l.environment)`,
    )
    .all(id);
  return { type: 'process', process, shown_variant: label ?? 'A', variants, live };
}

const READERS = {
  screen: screenContext,
  docs: docsContext,
  scan: scanContext,
  process: processContext,
} as const;

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
        'Read the page the BA is looking at (the "[Page context: …]" line names it). For a screen: the recorded state, the revisions of its screen with the scans that saw each, its elements (keys for highlight_element), its amendments with revision numbers, and the records that cite it. For docs: the record, its newest revision and its evidence. For a scan: the run and its counts. For a process: its variants with their steps (to-be steps are drawn by people) and which variant is live where. Read only.',
      inputSchema: {
        type: z
          .enum(['screen', 'docs', 'scan', 'process'])
          .describe('page type from the context line'),
        id: z
          .string()
          .describe(
            'the id from the context line (screen: state id; docs: record id; scan: run id; process: <process id>:<variant>)',
          ),
      },
    },
    ({ type, id }) => {
      try {
        const page = READERS[type](ctx, id);
        return page === null ? refused('NOT_FOUND', `no ${type} ${id}`) : ok(page);
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

  registerCredentialRequest(server, ok);

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

/** `request_credential` (FE-A05): only answers; the chat service shows the vault field. */
function registerCredentialRequest(server: McpServer, ok: Reply): void {
  server.registerTool(
    'request_credential',
    {
      description:
        'Ask the BA for a credential the scan needs (for example a login of a persona). The chat shows a vault field for that reference; the value goes into the vault and never to you or the chat. You learn it was stored from a "Stored in the vault: …" notice. Never ask for a password or token in a message.',
      inputSchema: {
        portal: z.string(),
        environment: z.enum(['sandbox', 'staging', 'production']),
        persona: z.string().describe('the persona that needs it'),
        ref: z
          .string()
          .regex(REF_NAME, 'capital letters, digits and underscores, e.g. LIVEINSURER_PASSWORD')
          .describe("the vault reference name the persona's auth block uses"),
        reason: z.string().max(300).optional().describe('one line: why the scan needs it'),
      },
    },
    ({ portal, environment, persona, ref }) =>
      ok({ requested: { portal, environment, persona, ref } }),
  );
}
