// `mudpuppy-chat` MCP server (R-30 T015, contracts/orchestrator-tools.md): the orchestrator's own
// tools. Every tool returns structured JSON or a coded error (`MISSING_INPUT`, `INVALID`, ...);
// gate refusals happen later in the mudpuppy server and are passed through by the crawler.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import { SECRETS, type EvidenceStore } from '@mudpuppy/core';
import { type MudPuppyDb } from '@mudpuppy/store';
import { registerModelTools } from './mcp-model-tools.js';
import { registerPageTools } from './mcp-page-tools.js';
import { registerProcessTools } from './mcp-process-tools.js';
import { workflowState } from '@mudpuppy/workflow';
import { existsSync } from 'node:fs';
import { PersonaFile, portalEnvironments } from '@mudpuppy/config';
import { PersonaRefusal, savePersona } from './personas.js';
import { SaveTestDataInput, saveTestData } from './test-data.js';
import { ProposalRefusal, ProposeInput, proposeChange } from './proposals.js';
import type { CheckRunDeps } from './check-runs.js';
import { RunRefusal, runningRunOf, stopRun } from './runs.js';
import { RequestScanInput, ScanRefusal, requestScan } from './scan.js';
import {
  ScopeRefusal,
  SetScopeInput,
  listProcessCandidates,
  requestDocumentation,
  setProcessScope,
} from './scope.js';
import { requestProcessUpdate } from './documentation-update.js';
import {
  listPortals,
  loadWorkflowInput,
  portalFile,
  type WorkspacePaths,
} from './workflow-data.js';

export interface ChatMcpContext {
  raw: BetterSqlite3.Database;
  paths: WorkspacePaths;
  /** The chat conversation this agent session belongs to (passed by the chat service). */
  conversationId: string;
  /** Recorded layouts for page_context and highlight_element (spec 022); null in tests without. */
  evidence?: EvidenceStore | null;
  /** The typed store for suggest_grouping (spec 022 M5); without it the tool is not offered. */
  db?: MudPuppyDb | null;
  /** Check runs (spec 039 owner answer 19); without it start_check_run is not offered. */
  checkRuns?: CheckRunDeps | null;
}

function ok(value: unknown): CallToolResult {
  const safe = SECRETS.redactJson(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe) }],
    structuredContent: safe as Record<string, unknown>,
  };
}

function refused(code: string, message: string, details: string[] = []): CallToolResult {
  const body = { error: { code, message, ...(details.length > 0 ? { details } : {}) } };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

function fail(error: unknown): CallToolResult {
  if (error instanceof PersonaRefusal) return refused(error.code, error.message, error.details);
  if (error instanceof ScanRefusal) return refused(error.code, error.message, error.missing);
  if (error instanceof ScopeRefusal) return refused(error.code, error.message, error.details);
  if (error instanceof RunRefusal) return refused(error.code, error.message);
  if (error instanceof ProposalRefusal) return refused(error.code, error.message);
  if (error instanceof z.ZodError)
    return refused(
      'INVALID',
      'the input is not valid',
      error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  return refused('INTERNAL', 'internal error in mudpuppy-chat; the chat service logs it');
}

export function createChatMcpServer(ctx: ChatMcpContext): McpServer {
  const server = new McpServer({ name: 'mudpuppy-chat', version: '0.1.0' });
  registerPageTools(server, { raw: ctx.raw, evidence: ctx.evidence ?? null }, ok, refused);
  registerModelTools(server, { raw: ctx.raw, checkRuns: ctx.checkRuns ?? null }, ok, refused);
  registerProcessTools(
    server,
    { raw: ctx.raw, db: ctx.db ?? null, conversationId: ctx.conversationId },
    ok,
    refused,
  );

  server.registerTool(
    'workflow_state',
    {
      description:
        'Where the work stands: configured portals, and for one portal each step (scan, map, narrow, document, amend) with its status, the valid next moves, what each blocked move is missing, and the moves to propose in order. Never guess the state; call this.',
      inputSchema: { portal: z.string().optional() },
    },
    ({ portal }) => {
      try {
        const input = loadWorkflowInput(ctx.raw, ctx.paths, portal ?? null, ctx.conversationId);
        // Spec 011: the portal's environments, so a scan can name one when there are several.
        let environments: string[] = [];
        if (portal !== undefined && existsSync(portalFile(ctx.paths, portal)))
          try {
            environments = portalEnvironments(portalFile(ctx.paths, portal)).map(
              // An environment without a limit has none (spec 021).
              (e) =>
                `${e.environment} (${e.base_url}, ${e.max_action_class ? `up to ${e.max_action_class}` : 'no limit'})`,
            );
          } catch {
            // a broken file: request_scan reports its problems
          }
        return ok({ portals: listPortals(ctx.paths), environments, ...workflowState(input) });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'save_persona',
    {
      description:
        'Save a persona the BA described, as personas/<portal>/<id>.yaml. auth is "none" or fields with ref:NAME values only (never a password; the BA types credentials in the dashboard form). max_action_class can only narrow the portal limit. Fails on an existing name.',
      inputSchema: {
        portal: z.string(),
        persona: PersonaFile.and(z.object({ id: z.string() })),
      },
    },
    (args) => {
      try {
        return ok(savePersona(ctx.paths, args));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'save_test_data',
    {
      description:
        "Add test values to an existing persona's test_data (spec 032): field label exactly as the form shows it → an obviously synthetic value. Use it when a scan reports missing_test_data: ask the BA once per field, then save. Personal data is refused; the persona must still load.",
      inputSchema: SaveTestDataInput.shape,
    },
    (args) => {
      try {
        return ok(saveTestData(ctx.paths, args));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'request_scan',
    {
      description:
        'Ask to scan (map) a portal as one persona in one of its environments (production, staging, sandbox; workflow_state lists them; may be left out when it has one), or with resume_run_id to continue a stopped (interrupted) scan (persona may then be left out: the run keeps its own). allow_writes defaults to true (the scan may fill and submit forms); pass false only when the BA asks the scan to only look; skip_images is the BA\'s answer to "skip loading images?" (default false); focus narrows the scan to the part the BA asked for: start_url (where to start, e.g. https://en.wikipedia.org/), only_domains (hosts to stay on, e.g. ["en.wikipedia.org"]), only_paths and exclude_paths (path globs, * matches anything, e.g. ["/wiki/Special:*"]); leave it out to map the whole portal; it never widens the portal. process {name, goal} traces that one process instead of mapping (the "map a process" step; a new run, not with resume_run_id). form_probing true is a "Probe forms" (form-probing) scan: it probes only the form steps the BA marked for probing (a plain scan never probes); a new run, not with resume_run_id or process. run_type starts a directed scan that reaches recorded screens by replaying the recorded path instead of mapping from the start page: "focused" (from the Start here / Focus marks, or plan.start_state_ids, within plan.depth), "continue" (a stopped scan: plan.parent_run_id), "recheck" (only record what the Recheck-marked screens show now), "retry" (repeat one failed action: plan.target_transition_id, plan.variation wait_longer / other_input / no_submit); persona and environment default to the parent run\'s. A resume keeps the run\'s own choices unless given. Checks the portal, persona and stored test-user credentials; on success records the scan step as pending and returns a hand-off: start the crawler agent with exactly that prompt. On MISSING_INPUT ask the BA only for the listed items.',
      inputSchema: RequestScanInput.shape,
    },
    (args) => {
      try {
        return ok(requestScan(ctx.raw, ctx.paths, ctx.conversationId, args));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'stop_scan',
    {
      description:
        "Stop the portal's running scan (map or trace run) when the BA asks. The run becomes interrupted: recorded pages stay, and request_scan with resume_run_id continues it later. NO_RUNNING_SCAN means nothing is running.",
      inputSchema: { portal: z.string() },
    },
    ({ portal }) => {
      try {
        return ok(stopRun(ctx.raw, runningRunOf(ctx.raw, portal), { byBa: true }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_process_candidates',
    {
      description:
        "Propose processes matching the BA's description, only from recorded data: traced processes (with start, end and states), documented process records, and mapped screens whose title or address matches. An empty list comes with a hint: offer a trace or a broader scan, never invent a process.",
      inputSchema: { portal: z.string(), description: z.string().min(1) },
    },
    ({ portal, description }) => {
      try {
        return ok({ portal, ...listProcessCandidates(ctx.raw, portal, description) });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'set_process_scope',
    {
      description:
        'Record the process scope the BA confirmed in the checklist beside the chat: name, persona, start and end state, selected states and per-state comments. Call it only with what the BA confirmed.',
      inputSchema: SetScopeInput.shape,
    },
    (args) => {
      try {
        return ok(setProcessScope(ctx.raw, ctx.paths.repoRoot, ctx.conversationId, args));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'request_documentation',
    {
      description:
        'Ask for as-is documentation of one recorded process scope (scope_id), or for an update of a process that is already documented (process_key: a process record PROC-… or a workspace process PRC-…; the BA then updates it with the new scans instead of rebuilding it). Give exactly one of them. On success records the document step as pending and returns a hand-off: start the ba agent with exactly that prompt.',
      inputSchema: {
        portal: z.string(),
        scope_id: z.string().optional(),
        process_key: z.string().optional(),
      },
    },
    ({ portal, scope_id, process_key }) => {
      try {
        if ((scope_id === undefined) === (process_key === undefined))
          throw new ScopeRefusal('INVALID', 'give scope_id or process_key, one of them');
        return ok(
          process_key !== undefined
            ? requestProcessUpdate(ctx.raw, ctx.conversationId, portal, process_key)
            : requestDocumentation(ctx.raw, ctx.conversationId, portal, scope_id!),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_amendments',
    {
      description:
        "Read a portal's amendments (to-be notes) with status, revision and, when one needs re-anchoring, the reason and the scan. Read only: you propose changes with propose_change; a person applies them, re-anchors or dismisses in the dashboard.",
      inputSchema: {
        portal: z.string(),
        status: z.enum(['active', 'needs_reanchor', 'dismissed', 'withdrawn']).optional(),
      },
    },
    ({ portal, status }) => {
      try {
        const rows = ctx.raw
          .prepare(
            `SELECT id, key, rev, target_kind, target_id, kind, text, attachment_name, status,
                    superseded_reason, superseded_detail, superseded_by_run, superseded_at, created_at
             FROM amendments_with_target WHERE portal_id = ? AND (? IS NULL OR status = ?)
             ORDER BY created_at`,
          )
          .all(portal, status ?? null, status ?? null);
        return ok({ portal, amendments: rows });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'propose_change',
    {
      description:
        'Propose a change to the to-be for the BA to apply or discard (the drawer shows it with Apply). With amendment_id: new text for an active amendment, or target_kind + target_id (+ optional text) to re-anchor one that needs it. Without amendment_id: a new note on a recorded screen (target_kind "state", target_id = state id) or on one of its elements ("wireframe_element", "<state id>#<element key>"). You never change amendments yourself; nothing changes until a person applies it.',
      inputSchema: ProposeInput.shape,
    },
    (args) => {
      try {
        const p = proposeChange(ctx.raw, ctx.conversationId, args);
        return ok({ proposal: { id: p.id, status: p.status, summary: p.summary } });
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
