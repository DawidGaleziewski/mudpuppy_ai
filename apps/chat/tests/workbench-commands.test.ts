// Spec 043 T016 (FR-010, D-5): command cards. Nothing runs before Confirm, only with the card's
// one-time token; a changed precondition or 10 minutes expire a proposal; a confirmed start or
// resume hands the crawler prompt to the assistant and is done once the run is in the store.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateUp, openDb, type OpenedDb } from '@mudpuppy/store';
import {
  CommandRefusal,
  cancelCommand,
  confirmCommand,
  getCommand,
  issueToken,
  proposeCommand,
  resolveScan,
  shortScan,
  undoCommand,
  type CommandRow,
  type ConfirmDeps,
} from '../src/workbench-commands.js';
import { settleCommands } from '../src/workbench-settle.js';

const repo = join(import.meta.dirname, '..', '..', '..');
const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-0000000000c1';
const STOPPED = '01a110d5-0000-7000-8000-000000000001';

let opened: OpenedDb;
let root: string;
let launches: { conversationId: string; prompt: string }[];
const raw = () => opened.raw;

function addRun(id: string, status: string, startedAt = '2026-10-06T10:47:00.000Z'): void {
  raw()
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
         locale, browser, config_snapshot, status, started_at)
       VALUES (?, ?, 'guest', 'map', 'sandbox', '2026-10-06', '1280x800', 'pl-PL', 'chromium', '{}', ?, ?)`,
    )
    .run(id, P, status, startedAt);
}

function deps(over: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return {
    raw: raw(),
    paths: { repoRoot: root },
    launch: (conversationId, prompt) => launches.push({ conversationId, prompt }),
    ...over,
  };
}

const propose = (command: string, args: Record<string, unknown>): CommandRow =>
  proposeCommand(raw(), {
    conversationId: CONV,
    turn: 1,
    portal: P,
    source: 'assistant',
    proposal: {
      command: command as CommandRow['command'],
      args,
      reason: 'The form never appeared.',
    },
  });

/** A failed command's message, as the card shows it. */
const messageOf = (row: CommandRow): string | undefined =>
  (JSON.parse(row.result_json ?? '{}') as { message?: string }).message;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wb-commands-'));
  for (const dir of ['portals/reference-insurer', 'personas/_mixins', 'personas/reference-insurer'])
    cpSync(join(repo, dir), join(root, dir), { recursive: true });
  opened = openDb(':memory:');
  migrateUp(opened.raw, join(repo, 'data', 'migrations'));
  raw()
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, status, created_at, updated_at, kind)
       VALUES (?, ?, '', 'active', '2026-10-06T10:00:00Z', '2026-10-06T10:00:00Z', 'workbench')`,
    )
    .run(CONV, P);
  launches = [];
});

afterEach(async () => {
  await opened.close();
  rmSync(root, { recursive: true, force: true });
});

describe('workbench commands', () => {
  it('names a run only by its full id, never a prefix (D-9, design answer Q6)', () => {
    const twin = '01a110d5-ffff-7000-8000-000000000002';
    addRun(STOPPED, 'interrupted');
    addRun(twin, 'completed', '2026-10-07T00:00:00.000Z');
    expect(resolveScan(raw(), P, STOPPED)).toBe(STOPPED);
    expect(resolveScan(raw(), P, twin)).toBe(twin);
    expect(resolveScan(raw(), P, '01a110d5')).toBeNull();
    expect(resolveScan(raw(), P, '01a110d5-0000-7000-8000-000000000009')).toBeNull();
    expect(resolveScan(raw(), P, '../etc')).toBeNull();
    expect(shortScan(STOPPED)).toBe('01a110d5-0000');
  });

  it('a proposal whose precondition fails is refused with one plain line', () => {
    addRun(STOPPED, 'interrupted');
    expect(() => propose('scan.stop', { scan: STOPPED})).toThrow('is not running');
    expect(() =>
      propose('path.attempt', { scan: STOPPED, step: 171, variation: 'wait_longer' }),
    ).toThrow(CommandRefusal);
  });

  it('nothing runs without the card token, and an old token stops working', () => {
    addRun(STOPPED, 'running');
    const row = propose('scan.stop', { scan: STOPPED});
    expect(row.state).toBe('proposed');
    expect(() =>
      confirmCommand(deps(), { id: row.id, token: 'test-token-not-real', by: 'dawid' }),
    ).toThrow('out of date');
    const first = issueToken(raw(), row.id);
    const second = issueToken(raw(), row.id);
    expect(() => confirmCommand(deps(), { id: row.id, token: first, by: 'dawid' })).toThrow(
      'out of date',
    );
    const done = confirmCommand(deps(), { id: row.id, token: second, by: 'dawid' });
    expect(done).toMatchObject({ state: 'done', confirmed_by: 'dawid' });
    expect(JSON.parse(done.result_json ?? '{}')).toEqual({ run_id: STOPPED });
    const run = raw().prepare(`SELECT status FROM runs WHERE id = ?`).get(STOPPED) as {
      status: string;
    };
    expect(run.status).toBe('interrupted');
    expect(() => confirmCommand(deps(), { id: row.id, token: second, by: 'dawid' })).toThrow(
      'is done',
    );
  });

  it('commands paused refuse the confirm', () => {
    addRun(STOPPED, 'running');
    const row = propose('scan.stop', { scan: STOPPED});
    const token = issueToken(raw(), row.id);
    expect(() =>
      confirmCommand(deps({ commandsOn: false }), { id: row.id, token, by: 'dawid' }),
    ).toThrow('paused');
  });

  it('a changed precondition expires the proposal instead of running it', () => {
    addRun(STOPPED, 'interrupted');
    const row = propose('scan.resume', { scan: STOPPED});
    raw().prepare(`UPDATE runs SET status = 'completed' WHERE id = ?`).run(STOPPED);
    const token = issueToken(raw(), row.id);
    const after = confirmCommand(deps(), { id: row.id, token, by: 'dawid' });
    expect(after.state).toBe('expired');
    expect(JSON.parse(after.result_json ?? '{}')).toEqual({ why: 'the scan changed since' });
    expect(launches).toEqual([]);
  });

  it('a resume hands the crawler prompt to the assistant, then is done when the run starts', () => {
    addRun(STOPPED, 'interrupted');
    const row = propose('scan.resume', { scan: STOPPED});
    const token = issueToken(raw(), row.id);
    const running = confirmCommand(deps(), { id: row.id, token, by: 'dawid' });
    expect(running.state).toBe('running');
    expect(launches).toHaveLength(1);
    expect(launches[0]?.prompt).toContain(STOPPED);
    expect(settleCommands(raw())).toEqual([]);
    addRun(
      '01a110e7-0000-7000-8000-000000000003',
      'running',
      new Date(Date.now() + 1000).toISOString(),
    );
    const [settled] = settleCommands(raw());
    expect(settled).toMatchObject({ id: row.id, state: 'done' });
    expect(JSON.parse(settled?.result_json ?? '{}')).toEqual({
      run_id: '01a110e7-0000-7000-8000-000000000003',
    });
  });

  it('a confirmed scan whose crawler never starts fails after the wait', () => {
    addRun(STOPPED, 'interrupted');
    const row = propose('scan.start', { type: 'continue_frontier' });
    confirmCommand(deps(), { id: row.id, token: issueToken(raw(), row.id), by: 'dawid' });
    const later = Date.now() + 11 * 60 * 1000;
    const [failed] = settleCommands(raw(), later);
    expect(failed).toMatchObject({ state: 'failed' });
    expect(failed?.error_ref).toMatch(/^WB-/);
  });

  it('a focused scan waits for phase 2; cancel folds a proposal', () => {
    expect(() => propose('scan.start', { type: 'focused' })).toThrow('Plan a run');
    addRun(STOPPED, 'running');
    const row = propose('scan.stop', { scan: STOPPED});
    expect(cancelCommand(raw(), row.id).state).toBe('cancelled');
    expect(() => issueToken(raw(), row.id)).toThrow('cancelled');
  });

  it("a portal's first scan starts as guest when the card picked no persona (spec 044 FR-002)", () => {
    const row = propose('scan.start', { type: 'full_map' });
    const done = confirmCommand(deps(), { id: row.id, token: issueToken(raw(), row.id), by: 'dawid' });
    expect(done.state).toBe('running');
    expect(launches).toHaveLength(1);
    expect(launches[0]?.prompt).toContain('guest');
  });

  it('a Start card starts as the persona the person picked (FR-004)', () => {
    cpSync(join(root, 'personas', P, 'guest.yaml'), join(root, 'personas', P, 'tester.yaml'));
    const row = propose('scan.start', { type: 'full_map' });
    const token = issueToken(raw(), row.id);
    confirmCommand(deps(), { id: row.id, token, by: 'dawid', persona: 'tester' });
    expect(launches[0]?.prompt).toContain('tester');
  });

  it('a picked persona the portal does not have fails and names what is missing (FR-004, FR-005)', () => {
    const row = propose('scan.start', { type: 'full_map' });
    const token = issueToken(raw(), row.id);
    const failed = confirmCommand(deps(), { id: row.id, token, by: 'dawid', persona: 'nobody' });
    expect(failed.state).toBe('failed');
    expect(messageOf(failed)).toBe('the scan needs more information: persona');
    expect(launches).toHaveLength(0);
  });

  it('a picked persona that is not a persona name fails without reading a file (FR-004)', () => {
    const row = propose('scan.start', { type: 'full_map' });
    const token = issueToken(raw(), row.id);
    const failed = confirmCommand(deps(), { id: row.id, token, by: 'dawid', persona: '../x' });
    expect(messageOf(failed)).toBe('"../x" is not a persona name');
  });

  it('proposals expire after 10 minutes', () => {
    addRun(STOPPED, 'running');
    const row = propose('scan.stop', { scan: STOPPED});
    const [expired] = settleCommands(raw(), Date.now() + 11 * 60 * 1000);
    expect(expired).toMatchObject({ id: row.id, state: 'expired' });
    expect(getCommand(raw(), row.id).confirmed_at).toBeNull();
  });
});

describe('persona.add (spec 072, designer 19/04)', () => {
  const persona = (name: string) => join(root, 'personas', P, `${name}.yaml`);

  it('adds what the person confirmed (their edits win), and Undo removes it', () => {
    const row = propose('persona.add', { name: 'klient-nowy', credential: 'REF_INSURER_KLIENT' });
    expect(existsSync(persona('klient-nowy'))).toBe(false); // nothing before Confirm
    const edited = { name: 'client', about: 'A signed-in customer', credential: 'REF_INSURER_KLIENT' };
    const done = confirmCommand(deps(), { id: row.id, token: issueToken(raw(), row.id), by: 'ba', args: edited });
    expect(done.state).toBe('done');
    expect(JSON.parse(done.args_json)).toEqual(edited); // the audit keeps what was confirmed
    expect(JSON.parse(done.result_json ?? '{}')).toMatchObject({ persona: 'client' });
    expect(existsSync(persona('client'))).toBe(true);
    expect(existsSync(persona('klient-nowy'))).toBe(false);
    expect(readFileSync(persona('client'), 'utf8')).toContain('ref:REF_INSURER_KLIENT_LOGIN');
    expect(undoCommand(raw(), { repoRoot: root }, row.id).state).toBe('undone');
    expect(existsSync(persona('client'))).toBe(false);
  });

  it('refuses edits that are not a persona, and fails a name taken meanwhile with its reason', () => {
    const row = propose('persona.add', { name: 'client' });
    expect(() => confirmCommand(deps(), { id: row.id, token: issueToken(raw(), row.id), by: 'ba', args: { name: 'Client!' } })).toThrow(/not valid/);
    const taken = propose('persona.add', { name: 'klient' }); // klient.yaml exists
    const failed = confirmCommand(deps(), { id: taken.id, token: issueToken(raw(), taken.id), by: 'ba' });
    expect(failed.state).toBe('failed');
    expect(messageOf(failed)).toContain('already exists');
    expect(() => undoCommand(raw(), { repoRoot: root }, taken.id)).toThrow(/cannot be undone/);
  });
});
