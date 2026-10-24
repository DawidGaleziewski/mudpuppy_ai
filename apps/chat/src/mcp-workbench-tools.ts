// The Workbench assistant's tools (spec 043 T017, D-1; designer 17-genui-architecture.md § 4):
// `render_view` and `propose_command`, offered only in a Workbench session. The model sees the
// designer's input schemas (`tools.json`, carried in the Zod schema's metadata); the handler gets
// the raw input and checks it with the full schemas, so a bad component is dropped, not the call
// (WB-UI-31). A view is stored per turn; a command is stored as a proposal a person confirms.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import { newId, nowIso } from '@mudpuppy/core';
import {
  createCommandChecker,
  createViewChecker,
  loadContract,
  type CheckResult,
  type ViewComponent,
  type WbPath,
} from '@mudpuppy/workbench-contract';
import { CommandRefusal, proposeCommand, resolveScan } from './workbench-commands.js';
import { AskChoiceInput, AskChoiceShape, storeChoice } from './workbench-choices.js';
import { commandsAllowedOn, commandsOffReason } from './workbench-envs.js';
import { currentTurn } from './workbench-turn.js';

export interface WorkbenchToolContext {
  raw: BetterSqlite3.Database;
  conversationId: string;
  /** The person's rollout phase (1 in spec 043). */
  phase: number;
  /** The chat's environment (D-6): a proposal is refused where commands are off; unset, the confirm checks. */
  environment?: string;
  /** The live Workbench (spec 075): `ask_choice` too. */
  live?: boolean;
}

type Ok = (value: unknown) => CallToolResult;
type Refused = (code: string, message: string, details?: string[]) => CallToolResult;

const contract = loadContract();
const checkView = createViewChecker(contract);
const checkCommand = createCommandChecker(contract);

/** The tool's advertised schema is the designer's; validation is ours (drop, don't fail). */
function advertised(name: string) {
  const tool = contract.tools.find((t) => t.name === name);
  if (tool === undefined) throw new Error(`workbench contract: no tool ${name}`);
  return { description: tool.description, schema: z.looseObject({}).meta(tool.input_schema) };
}

interface Conversation {
  portal_id: string | null;
  path: WbPath;
}

function conversationOf(raw: BetterSqlite3.Database, id: string): Conversation {
  const row = raw
    .prepare(
      `SELECT c.portal_id, COALESCE(w.path, 'chat') AS path FROM chat_conversations c
       LEFT JOIN workbench_conversations w ON w.conversation_id = c.id WHERE c.id = ?`,
    )
    .get(id) as Conversation | undefined;
  if (row === undefined) throw new Error(`conversation ${id} does not exist`);
  return row;
}

/** Layer 4 (doc 17 § 5.1): every id the component binds exists in this portal. */
export function idResolver(raw: BetterSqlite3.Database, portal: string) {
  const record = raw.prepare(
    `SELECT 1 FROM doc_records WHERE portal_id = ? AND key = ? AND withdrawn = 0`,
  );
  const page = raw.prepare(
    `SELECT 1 FROM state_observations o JOIN states s ON s.id = o.state_id
     WHERE o.run_id = ? AND s.route_template = ? LIMIT 1`,
  );
  return (c: ViewComponent): boolean => {
    const bind = c.bind;
    const scan = typeof bind.scan === 'string' ? resolveScan(raw, portal, bind.scan) : undefined;
    if (scan === null) return false;
    const ref = bind.page;
    if (scan !== undefined && typeof ref === 'object' && ref !== null && 'route' in ref)
      if (page.get(scan, (ref as { route: string }).route) === undefined) return false;
    const records = [
      ...(typeof bind.record === 'string' ? [bind.record] : []),
      ...(Array.isArray(bind.records) ? (bind.records as string[]) : []),
    ];
    return records.every((key) => record.get(portal, key) !== undefined);
  };
}

interface StoredView {
  id: string;
  fallback: number;
}

/** One view per turn; a fallback may be repaired once (doc 17 § 4.6), anything more is ignored. */
function storeView(
  ctx: WorkbenchToolContext,
  turn: number,
  received: unknown,
  result: CheckResult,
): { id: string } | null {
  const { raw, conversationId } = ctx;
  const earlier = raw
    .prepare(`SELECT id, fallback FROM workbench_views WHERE conversation_id = ? AND turn = ?`)
    .get(conversationId, turn) as StoredView | undefined;
  if (earlier !== undefined && earlier.fallback === 0) return null;
  const row = {
    id: earlier?.id ?? newId(),
    conversation_id: conversationId,
    turn,
    path: result.spec.path,
    why: result.spec.why,
    spec_json: JSON.stringify(result.spec),
    received_json: JSON.stringify(received ?? null),
    dropped_json: JSON.stringify(result.dropped),
    repaired_json: JSON.stringify(result.repaired),
    fallback: result.fallback ? 1 : 0,
    created_at: nowIso(),
  };
  raw
    .prepare(
      `INSERT INTO workbench_views (id, conversation_id, turn, path, why, spec_json, received_json,
         dropped_json, repaired_json, fallback, created_at)
       VALUES (@id, @conversation_id, @turn, @path, @why, @spec_json, @received_json, @dropped_json,
         @repaired_json, @fallback, @created_at)
       ON CONFLICT (conversation_id, turn) DO UPDATE SET path = excluded.path, why = excluded.why,
         spec_json = excluded.spec_json, received_json = excluded.received_json,
         dropped_json = excluded.dropped_json, repaired_json = excluded.repaired_json,
         fallback = excluded.fallback, created_at = excluded.created_at`,
    )
    .run(row);
  if (!result.fallback && result.spec.components.length > 0)
    raw
      .prepare(
        `INSERT INTO workbench_conversations (conversation_id, path, path_source, updated_at)
         VALUES (?, ?, 'assistant', ?)
         ON CONFLICT (conversation_id) DO UPDATE SET path = excluded.path,
           path_source = 'assistant', updated_at = excluded.updated_at`,
      )
      .run(conversationId, result.spec.path, nowIso());
  return { id: row.id };
}

export function registerWorkbenchTools(
  server: McpServer,
  ctx: WorkbenchToolContext,
  ok: Ok,
  refused: Refused,
): void {
  const view = advertised('render_view');
  server.registerTool(
    'render_view',
    { description: view.description, inputSchema: view.schema },
    (input) => {
      const conversation = conversationOf(ctx.raw, ctx.conversationId);
      const turn = currentTurn(ctx.raw, ctx.conversationId);
      const result = checkView(input, {
        phase: ctx.phase,
        currentPath: conversation.path,
        ...(conversation.portal_id === null
          ? {}
          : { idExists: idResolver(ctx.raw, conversation.portal_id) }),
      });
      const stored = storeView(ctx, turn, input, result);
      if (stored === null)
        return refused('ALREADY_COMPOSED', 'one view per turn: this call was ignored');
      const dropped = result.dropped.map((d) => `${String(d.index)}:${d.code}`);
      return ok({
        view_id: stored.id,
        turn,
        path: result.spec.path,
        shown: result.spec.components.map((c) => c.id),
        dropped,
        fallback: result.fallback,
        message: result.fallback
          ? 'Nothing in this view was valid; the person sees your words only. You may call render_view once more with a corrected spec.'
          : 'The view is on the person’s screen; the server fills it with live data.',
      });
    },
  );

  const command = advertised('propose_command');
  server.registerTool(
    'propose_command',
    { description: command.description, inputSchema: command.schema },
    (input) => {
      const checked = checkCommand(input);
      if (!checked.ok)
        return refused(checked.code.toUpperCase(), `the proposal is ${checked.code}`);
      const conversation = conversationOf(ctx.raw, ctx.conversationId);
      if (conversation.portal_id === null)
        return refused('NO_PORTAL', 'pick a portal before proposing a command');
      if (ctx.environment !== undefined && !commandsAllowedOn(ctx.environment))
        return refused('PAUSED', commandsOffReason(ctx.environment));
      try {
        const row = proposeCommand(ctx.raw, {
          conversationId: ctx.conversationId,
          turn: currentTurn(ctx.raw, ctx.conversationId),
          proposal: checked.proposal,
          source: 'assistant',
          portal: conversation.portal_id,
        });
        return ok({
          command_id: row.id,
          state: 'proposed',
          message: 'proposed, waiting for the person to confirm',
        });
      } catch (error) {
        if (error instanceof CommandRefusal) return refused(error.code, error.message);
        throw error;
      }
    },
  );
  if (ctx.live === true) registerChoiceTool(server, ctx, ok, refused);
}

/** `ask_choice` (spec 075 FR-008): a drop-down on the person's screen; the answer is an event turn. */
function registerChoiceTool(server: McpServer, ctx: WorkbenchToolContext, ok: Ok, refused: Refused): void {
  server.registerTool(
    'ask_choice',
    {
      description:
        'Ask the person to pick one thing in a drop-down on their screen instead of asking in words. kind: portal (move to another portal), store (another data store), persona (which persona to scan as), answer (your own 2-6 options as {value, label}). The options for portal, store and persona come from the server. The answer comes back as an "[event] The person answered" message. One choice at a time.',
      inputSchema: AskChoiceShape.shape,
    },
    (input) => {
      const checked = AskChoiceInput.safeParse(input);
      if (!checked.success)
        return refused('INVALID', 'the choice is not valid', checked.error.issues.map((i) => i.message));
      const choice = storeChoice(ctx.raw, ctx.conversationId, currentTurn(ctx.raw, ctx.conversationId), checked.data);
      return ok({ choice_id: choice.id, message: 'The drop-down is on the person’s screen; wait for their answer.' });
    },
  );
}
