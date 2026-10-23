// Workbench command cards (spec 043 T016, FR-010; designer 17-genui-architecture.md § 5.6, D-5,
// D-6): every write is a proposal a person confirms. A proposal stores only the hash of its
// one-time confirm token; Confirm checks the token, the expiry and the preconditions again, then
// runs the command through the chat's own paths. `scan.stop` stops the run here; `scan.start` and
// `scan.resume` run request_scan's checks and give the hand-off to the Workbench assistant, which
// the Workbench fence lets start the crawler with that prompt only (F-10). The row is the audit.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import type { CommandProposal } from '@mudpuppy/workbench-contract';
import { addPersona, personaArgs, refusalText, removePersona } from './persona-add.js';
import { PersonaRefusal } from './personas.js';
import { stopRun } from './runs.js';
import { requestScan, ScanRefusal, type RequestScanInput } from './scan.js';
import { SCAN_ID } from './workbench-context.js';
import { fallbackPersona, isPersonaName } from './workbench-persona.js';
import type { WorkspacePaths } from './workflow-data.js';

export const PROPOSAL_TTL_MS = 10 * 60 * 1000;
/** A confirmed scan command whose crawler never started a run fails after this long. */
export const START_WAIT_MS = 10 * 60 * 1000;

export type CommandState =
  'proposed' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired' | 'undone';

export class CommandRefusal extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'NOT_PROPOSED'
      | 'BAD_TOKEN'
      | 'EXPIRED'
      | 'PRECONDITION'
      | 'NOT_IN_PHASE'
      | 'PAUSED',
    message: string,
  ) {
    super(message);
    this.name = 'CommandRefusal';
  }
}

export interface CommandRow {
  id: string;
  conversation_id: string;
  turn: number;
  command: CommandProposal['command'];
  args_json: string;
  reason: string;
  source: 'assistant' | 'button';
  state: CommandState;
  token_hash: string;
  precondition_hash: string;
  idempotency_key: string;
  expires_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  result_json: string | null;
  error_ref: string | null;
  created_at: string;
  updated_at: string;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const newToken = (): string => randomBytes(24).toString('base64url');

/** A full scan id (D-9) when it names a run of the portal; anything else is null. */
export function resolveScan(raw: BetterSqlite3.Database, portal: string, id: string): string | null {
  if (!SCAN_ID.test(id)) return null;
  const row = raw.prepare(`SELECT id FROM runs WHERE portal_id = ? AND id = ?`).get(portal, id) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

/** A scan id as people read it (design answer Q6): the first two groups, the start time. */
export const shortScan = (id: string): string => id.split('-').slice(0, 2).join('-');

interface Run {
  id: string;
  status: string;
  persona_id: string;
  environment: string;
}

const runOf = (raw: BetterSqlite3.Database, id: string): Run | undefined =>
  raw.prepare(`SELECT id, status, persona_id, environment FROM runs WHERE id = ?`).get(id) as
    Run | undefined;

/** What a confirmed command will do, resolved against the store now. */
export interface Prepared {
  /** The run the command acts on (stop, resume) or continues; null for a plain new scan. */
  runId: string | null;
  /** request_scan's input for start and resume; null for stop. */
  scan: RequestScanInput | null;
  /** Hash of the state the proposal assumed: a change makes the confirm refuse (expired). */
  preconditionHash: string;
}

function needRun(raw: BetterSqlite3.Database, portal: string, scan: unknown): Run {
  const id = typeof scan === 'string' ? resolveScan(raw, portal, scan) : null;
  const run = id === null ? undefined : runOf(raw, id);
  if (run === undefined)
    throw new CommandRefusal('PRECONDITION', `there is no scan ${String(scan)} on ${portal}`);
  return run;
}

/** The newest run of the portal (its persona is what a new Workbench scan uses). */
const newestRun = (raw: BetterSqlite3.Database, portal: string): Run | undefined =>
  raw
    .prepare(
      `SELECT id, status, persona_id, environment FROM runs WHERE portal_id = ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(portal) as Run | undefined;

/**
 * The persona a new scan starts as (spec 044 FR-002, FR-004): the person's choice on the card,
 * else the newest scan's (already in `scan`), else `guest`, else the first persona by name. A
 * continued run keeps its own persona.
 */
function startAs(
  paths: WorkspacePaths,
  scan: RequestScanInput,
  chosen: string | undefined,
): RequestScanInput {
  if (scan.run_type === 'continue') return scan;
  if (chosen !== undefined) {
    if (!isPersonaName(chosen))
      throw new CommandRefusal('PRECONDITION', `"${chosen}" is not a persona name`);
    return { ...scan, persona: chosen };
  }
  if (scan.persona !== undefined) return scan;
  const persona = fallbackPersona(paths, scan.portal);
  return persona === undefined ? scan : { ...scan, persona };
}

/** The preconditions of each command (doc 17 § 4.3); a refusal is one plain line for the chat. */
export function prepare(
  raw: BetterSqlite3.Database,
  portal: string,
  proposal: CommandProposal,
): Prepared {
  const args = proposal.args;
  switch (proposal.command) {
    case 'scan.stop': {
      const run = needRun(raw, portal, args.scan);
      if (run.status !== 'running')
        throw new CommandRefusal('PRECONDITION', `scan ${shortScan(run.id)} is not running`);
      return { runId: run.id, scan: null, preconditionHash: sha256(`stop ${run.id} running`) };
    }
    case 'scan.resume': {
      const run = needRun(raw, portal, args.scan);
      if (run.status === 'running')
        throw new CommandRefusal('PRECONDITION', `scan ${shortScan(run.id)} is running`);
      return {
        runId: run.id,
        scan: { portal, run_type: 'continue', plan: { parent_run_id: run.id } },
        preconditionHash: sha256(`resume ${run.id} ${run.status}`),
      };
    }
    case 'scan.start':
      return prepareStart(raw, portal, args);
    case 'persona.add': {
      // checked again on Confirm (the person may edit it); a name taken meanwhile is refused
      // when it runs (savePersona never overwrites)
      const checked = personaArgs(args);
      if (!checked.ok) throw new CommandRefusal('PRECONDITION', checked.problem);
      return { runId: null, scan: null, preconditionHash: sha256(`persona.add ${portal}`) };
    }
    default:
      throw new CommandRefusal('NOT_IN_PHASE', `${proposal.command} comes with phase 2`);
  }
}

function prepareStart(
  raw: BetterSqlite3.Database,
  portal: string,
  args: Record<string, unknown>,
): Prepared {
  if (args.type === 'focused' || args.start !== undefined)
    throw new CommandRefusal(
      'NOT_IN_PHASE',
      'a focused scan or a start page is set up in Scans ▸ Plan a run for now',
    );
  const running = raw
    .prepare(`SELECT id FROM runs WHERE portal_id = ? AND status = 'running' LIMIT 1`)
    .get(portal) as { id: string } | undefined;
  if (running !== undefined)
    throw new CommandRefusal('PRECONDITION', `scan ${shortScan(running.id)} is running`);
  const last = newestRun(raw, portal);
  if (args.type === 'continue_frontier') {
    if (last === undefined)
      throw new CommandRefusal('PRECONDITION', `${portal} has no scan to continue`);
    return {
      runId: last.id,
      scan: { portal, run_type: 'continue', plan: { parent_run_id: last.id } },
      preconditionHash: sha256(`continue ${last.id} ${last.status}`),
    };
  }
  // the persona the assistant proposed, else the last scan's (spec 073 FR-002)
  const persona = typeof args.persona === 'string' ? args.persona : last?.persona_id;
  return {
    runId: null,
    scan: { portal, ...(persona === undefined ? {} : { persona }) },
    preconditionHash: sha256(`start ${portal} idle`),
  };
}

export interface NewCommand {
  conversationId: string;
  turn: number;
  proposal: CommandProposal;
  source: 'assistant' | 'button';
  portal: string;
}

/** Store a proposal after its preconditions held; the dashboard asks for a token to show it. */
export function proposeCommand(raw: BetterSqlite3.Database, input: NewCommand): CommandRow {
  const prepared = prepare(raw, input.portal, input.proposal);
  const now = nowIso();
  const row: CommandRow = {
    id: newId(),
    conversation_id: input.conversationId,
    turn: input.turn,
    command: input.proposal.command,
    args_json: JSON.stringify(input.proposal.args),
    reason: input.proposal.reason,
    source: input.source,
    state: 'proposed',
    token_hash: sha256(newToken()), // no token is valid until the dashboard asks for one
    precondition_hash: prepared.preconditionHash,
    idempotency_key: newId(),
    expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    confirmed_by: null,
    confirmed_at: null,
    result_json: null,
    error_ref: null,
    created_at: now,
    updated_at: now,
  };
  raw
    .prepare(
      `INSERT INTO workbench_commands (id, conversation_id, turn, command, args_json, reason, source,
         state, token_hash, precondition_hash, idempotency_key, expires_at, confirmed_by,
         confirmed_at, result_json, error_ref, created_at, updated_at)
       VALUES (@id, @conversation_id, @turn, @command, @args_json, @reason, @source, @state,
         @token_hash, @precondition_hash, @idempotency_key, @expires_at, @confirmed_by,
         @confirmed_at, @result_json, @error_ref, @created_at, @updated_at)`,
    )
    .run(row);
  return row;
}

export function getCommand(raw: BetterSqlite3.Database, id: string): CommandRow {
  const row = raw.prepare(`SELECT * FROM workbench_commands WHERE id = ?`).get(id) as
    CommandRow | undefined;
  if (row === undefined) throw new CommandRefusal('NOT_FOUND', 'this command does not exist');
  return row;
}

const portalOf = (raw: BetterSqlite3.Database, conversationId: string): string => {
  const row = raw
    .prepare(`SELECT portal_id FROM chat_conversations WHERE id = ?`)
    .get(conversationId) as { portal_id: string | null } | undefined;
  if (row?.portal_id == null)
    throw new CommandRefusal('NOT_FOUND', 'the conversation has no portal');
  return row.portal_id;
};
export const commandPortal = portalOf;

function setState(
  raw: BetterSqlite3.Database,
  id: string,
  state: CommandState,
  extra: Partial<
    Pick<CommandRow, 'result_json' | 'error_ref' | 'confirmed_by' | 'confirmed_at'>
  > = {},
): void {
  const now = nowIso();
  raw
    .prepare(
      `UPDATE workbench_commands SET state = ?, updated_at = ?,
         result_json = COALESCE(?, result_json), error_ref = COALESCE(?, error_ref),
         confirmed_by = COALESCE(?, confirmed_by), confirmed_at = COALESCE(?, confirmed_at)
       WHERE id = ?`,
    )
    .run(
      state,
      now,
      extra.result_json ?? null,
      extra.error_ref ?? null,
      extra.confirmed_by ?? null,
      extra.confirmed_at ?? null,
      id,
    );
}

/** For the timer's pass (`workbench-settle`). */
export const setCommandState = setState;

/** A fresh one-time token for the card on screen; the previous one stops working. */
export function issueToken(raw: BetterSqlite3.Database, id: string): string {
  const row = getCommand(raw, id);
  if (row.state !== 'proposed')
    throw new CommandRefusal('NOT_PROPOSED', `the command is ${row.state}`);
  const token = newToken();
  raw
    .prepare(`UPDATE workbench_commands SET token_hash = ?, updated_at = ? WHERE id = ?`)
    .run(sha256(token), nowIso(), id);
  return token;
}

export interface ConfirmDeps {
  raw: BetterSqlite3.Database;
  paths: WorkspacePaths;
  /** Give the hand-off to the conversation's assistant (and allow that crawler start, once). */
  launch: (conversationId: string, prompt: string, command: CommandRow) => void;
  /** Tell the conversations following a stopped run (the chat's own stop does). */
  stopped?: (runId: string) => void;
  /** `workbench_commands` setting, or an environment not switched on (D-6): off pauses the cards. */
  commandsOn?: boolean;
  /** Why commands are off, for the card (D-6); a plain "paused" without it. */
  offReason?: string;
}

function tokenMatches(row: CommandRow, token: string): boolean {
  const given = Buffer.from(sha256(token), 'hex');
  const stored = Buffer.from(row.token_hash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** An editable card's fields as confirmed (designer 19/04): kept on the row, which is the audit. */
function takeEdited(raw: BetterSqlite3.Database, row: CommandRow, args: Record<string, unknown> | undefined): CommandRow {
  if (args === undefined || row.command !== 'persona.add') return row;
  const checked = personaArgs(args);
  if (!checked.ok) throw new CommandRefusal('PRECONDITION', checked.problem);
  raw.prepare(`UPDATE workbench_commands SET args_json = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(checked.args), nowIso(), row.id);
  return getCommand(raw, row.id);
}

/** Confirm (WB-UI-21, -23): nothing reaches a scan before this, and only with the card's token. */
export function confirmCommand(
  deps: ConfirmDeps,
  /**
   * `persona`: the person's choice on a Start card (spec 044); ignored by stop and resume.
   * `args`: an editable card's fields as the person left them (persona.add, spec 072).
   */
  input: { id: string; token: string; by: string; persona?: string; args?: Record<string, unknown> },
): CommandRow {
  const { raw } = deps;
  if (deps.commandsOn === false)
    throw new CommandRefusal('PAUSED', deps.offReason ?? 'commands are paused');
  const found = getCommand(raw, input.id);
  if (found.state !== 'proposed')
    throw new CommandRefusal('NOT_PROPOSED', `the command is ${found.state}`);
  if (!tokenMatches(found, input.token))
    throw new CommandRefusal('BAD_TOKEN', 'this card is out of date; reload it');
  const row = takeEdited(raw, found, input.args);
  const proposal: CommandProposal = {
    command: row.command,
    args: JSON.parse(row.args_json) as Record<string, unknown>,
    reason: row.reason,
  };
  const why = expiryReason(raw, row, proposal);
  if (why !== null) {
    setState(raw, row.id, 'expired', { result_json: JSON.stringify({ why }) });
    return getCommand(raw, row.id);
  }
  const prepared = prepare(raw, portalOf(raw, row.conversation_id), proposal);
  setState(raw, row.id, 'running', { confirmed_by: input.by, confirmed_at: nowIso() });
  run(deps, getCommand(raw, row.id), prepared, input.persona);
  return getCommand(raw, row.id);
}

/** Why a proposal no longer applies, or null: 10 minutes passed, or what it assumed changed. */
function expiryReason(
  raw: BetterSqlite3.Database,
  row: CommandRow,
  proposal: CommandProposal,
): string | null {
  if (Date.parse(row.expires_at) <= Date.now()) return 'it was proposed more than 10 minutes ago';
  try {
    const now = prepare(raw, portalOf(raw, row.conversation_id), proposal);
    return now.preconditionHash === row.precondition_hash ? null : 'the scan changed since';
  } catch (error) {
    if (error instanceof CommandRefusal) return error.message;
    throw error;
  }
}

function run(
  deps: ConfirmDeps,
  row: CommandRow,
  prepared: Prepared,
  persona: string | undefined,
): void {
  const { raw } = deps;
  try {
    if (row.command === 'persona.add') {
      const saved = addPersona(deps.paths, portalOf(raw, row.conversation_id), JSON.parse(row.args_json));
      setState(raw, row.id, 'done', {
        result_json: JSON.stringify({ persona: saved.persona, credential_refs: saved.credentialRefs }),
      });
      return;
    }
    if (row.command === 'scan.stop' && prepared.runId !== null) {
      stopRun(raw, prepared.runId, { byBa: true });
      deps.stopped?.(prepared.runId);
      setState(raw, row.id, 'done', { result_json: JSON.stringify({ run_id: prepared.runId }) });
      return;
    }
    if (prepared.scan === null) throw new CommandRefusal('PRECONDITION', 'nothing to run');
    const scan = startAs(deps.paths, prepared.scan, persona);
    const handoff = requestScan(raw, deps.paths, row.conversation_id, scan);
    deps.launch(row.conversation_id, handoff.handoff.prompt, row);
  } catch (error) {
    setState(raw, row.id, 'failed', {
      error_ref: `WB-${row.id.slice(-8)}`,
      result_json: JSON.stringify({ message: failure(error) }),
    });
  }
}

/** The card's line for a failed command; a refused scan names what it misses (spec 044 FR-005). */
function failure(error: unknown): string {
  if (error instanceof ScanRefusal && error.missing.length > 0)
    return `${error.message}: ${error.missing.join(', ')}`;
  if (error instanceof PersonaRefusal) return refusalText(error);
  return error instanceof ScanRefusal || error instanceof CommandRefusal
    ? error.message
    : 'the command failed';
}

/** Undo a done `persona.add` (designer 19/04): remove the persona while no scan used it. */
export function undoCommand(raw: BetterSqlite3.Database, paths: WorkspacePaths, id: string): CommandRow {
  const row = getCommand(raw, id);
  if (row.command !== 'persona.add' || row.state !== 'done')
    throw new CommandRefusal('NOT_PROPOSED', `the command is ${row.state} and cannot be undone`);
  try {
    removePersona(raw, paths, portalOf(raw, row.conversation_id), (JSON.parse(row.args_json) as { name: string }).name);
  } catch (error) {
    throw error instanceof PersonaRefusal ? new CommandRefusal('PRECONDITION', error.message) : error;
  }
  setState(raw, id, 'undone');
  return getCommand(raw, id);
}

export function cancelCommand(raw: BetterSqlite3.Database, id: string): CommandRow {
  const row = getCommand(raw, id);
  if (row.state !== 'proposed')
    throw new CommandRefusal('NOT_PROPOSED', `the command is ${row.state}`);
  setState(raw, id, 'cancelled');
  return getCommand(raw, id);
}
