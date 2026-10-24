// Spec 043 T050 (SC-002, SC-004): the Workbench end to end, in a real browser against the real
// dashboard (beta on) and the chat service on one temp store, with the fake agent. The live map
// updates from the store with no model in between; a command card runs nothing before Confirm,
// and Confirm stops the scan; a message's answer arrives over the stream.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPathFor, migrateUp, openDb, type OpenedDb } from '@mudpuppy/store';
import { createApi, listenLocal } from '../src/api.js';
import { ChatService } from '../src/service.js';
import { ChatStore } from '../src/store.js';
import { proposeCommand } from '../src/workbench-commands.js';
import { createWorkbenchService } from '../src/workbench-service.js';
import { Launches } from '../src/workbench-session.js';
import { fakeAgent } from './fake-agent.js';
import { MIGRATIONS } from './helpers.js';

const repo = resolve(import.meta.dirname, '../../..');
const P = 'reference-insurer';
const T = '2026-10-06T10:47:00.000Z';
const RUN = '01a110d5-0000-7000-8000-000000000001';
const CONV = '0199a000-0000-7000-8000-0000000000e9';

const browser: Browser | null = await chromium.launch().catch(() => null);

let root: string;
let opened: OpenedDb;
let api: Server;
let service: ChatService;
let dashboard: ChildProcess | null = null;
let base: string;
let seq = 0;
const raw = () => opened.raw;

function visit(stateId: string, route: string, title: string): void {
  seq += 10;
  const call = `call-${String(seq)}`;
  const span = (id: string, s: number, extra: Record<string, unknown>) =>
    raw()
      .prepare(
        `INSERT INTO trace_spans (id, boot_id, seq, run_id, parent_id, kind, name, status, started_at,
           ended_at, duration_ms, attrs_json, summary)
         VALUES (@id, 'boot-e2e', @seq, @run, @parent, @kind, @name, 'ok', @at, @ended, @ms, @attrs, '')`,
      )
      .run({
        id,
        seq: s,
        run: RUN,
        parent: null,
        kind: 'call',
        name: 'navigate',
        at: T,
        ended: T,
        ms: 1,
        attrs: '{}',
        ...extra,
      });
  raw()
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
         confidence, stabilization, first_seen_run, created_at)
       VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', ?, ?)`,
    )
    .run(stateId, P, `fp-${stateId}`, route, title, RUN, T);
  span(call, seq, {});
  span(`ev-${String(seq)}`, seq + 1, {
    parent: call,
    kind: 'event',
    name: 'state_recorded',
    ended: null,
    ms: null,
    attrs: JSON.stringify({ state_id: stateId, created: true, evidence_ref: 'ev' }),
  });
  raw()
    .prepare(
      `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at)
       VALUES (?, ?, 'guest', 'ev', ?)`,
    )
    .run(RUN, stateId, T);
}

function seed(): void {
  const r = raw();
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
       locale, browser, config_snapshot, status, started_at)
     VALUES (?, ?, 'guest', 'map', 'sandbox', '2026-10-06', '1280x800', 'pl-PL', 'chromium', '{}', 'running', ?)`,
  ).run(RUN, P, T);
  r.prepare(
    `INSERT INTO trace_boots (id, started_at, environment, server, pid, version, trace_level, pw_trace)
     VALUES ('boot-e2e', ?, 'sandbox', 'mudpuppy', 1, 'test', 'standard', 'non_production')`,
  ).run(T);
  visit('st-1', '/', 'Ubezpieczenia dla Ciebie');
  visit('st-2', '/porownanie', 'Porównanie');
  r.prepare(
    `INSERT INTO chat_conversations (id, portal_id, goal, status, created_at, updated_at, kind)
     VALUES (?, ?, 'workbench', 'active', ?, ?, 'workbench')`,
  ).run(CONV, P, T, T);
  r.prepare(
    `INSERT INTO workbench_conversations (conversation_id, path, path_source, updated_at)
     VALUES (?, 'mapping', 'assistant', ?)`,
  ).run(CONV, T);
  const message = r.prepare(
    `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  message.run('m0', CONV, 0, 'user', 'Map the OC/AC calculator.', T);
  message.run('m1', CONV, 1, 'assistant', 'Starting a map scan.', T);
  const spec = {
    version: '1',
    path: 'mapping',
    why: 'You asked to map the calculator.',
    // full scan ids in data (D-9, spec 061)
    components: [{ id: 'map', type: 'LiveMap', bind: { scan: RUN } }],
  };
  r.prepare(
    `INSERT INTO workbench_views (id, conversation_id, turn, path, why, spec_json, received_json, created_at)
     VALUES ('view-e2e', ?, 1, 'mapping', ?, ?, ?, ?)`,
  ).run(CONV, spec.why, JSON.stringify(spec), JSON.stringify(spec), T);
  proposeCommand(r, {
    conversationId: CONV,
    turn: 1,
    portal: P,
    source: 'assistant',
    proposal: { command: 'scan.stop', args: { scan: RUN }, reason: 'You asked to stop it.' },
  });
}

async function freePort(): Promise<number> {
  const probe = createServer();
  const port = await listenLocal(probe, 0);
  await new Promise((done) => probe.close(done));
  return port;
}

async function waitUp(url: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`not up: ${url}`);
}

beforeAll(async () => {
  if (!browser) return;
  root = mkdtempSync(join(tmpdir(), 'mudpuppy-e2e-workbench-'));
  mkdirSync(join(root, 'data', 'db'), { recursive: true });
  opened = openDb(dbPathFor(join(root, 'data'), 'sandbox'));
  migrateUp(opened.raw, MIGRATIONS);
  seed();
  const logError = () => Promise.resolve({ ref: 'ERR-E2E', logged: true });
  service = new ChatService({
    store: new ChatStore(opened.db),
    launch: fakeAgent().launch,
    sessionRequest: () => ({ cwd: root, mcpServers: [] }),
    policy: () => ({ allow: true, reason: '' }),
    logError,
  });
  const workbench = createWorkbenchService({
    raw: opened.raw,
    service,
    paths: { repoRoot: repo },
    launches: new Launches(),
    telemetry: () => undefined,
  });
  api = createApi({
    service,
    logError,
    findError: () => Promise.resolve(null),
    version: 'test',
    workbench,
  });
  const chatBase = `http://127.0.0.1:${String(await listenLocal(api, 0))}`;
  const port = await freePort();
  dashboard = spawn('uv', ['run', '--quiet', 'mudpuppy-dashboard'], {
    cwd: join(repo, 'apps', 'dashboard'),
    env: {
      ...process.env,
      MUDPUPPY_DATA_DIR: join(root, 'data'),
      MUDPUPPY_DEFAULT_ENV: 'sandbox',
      MUDPUPPY_PORT: String(port),
      MUDPUPPY_CHAT_URL: chatBase,
      MUDPUPPY_REVIEWER: 'dawid',
      MUDPUPPY_WORKBENCH: '1',
    },
    stdio: 'ignore',
  });
  base = `http://127.0.0.1:${String(port)}`;
  await waitUp(`${base}/api/workbench/portals/${P}?c=${CONV}`);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  dashboard?.kill('SIGTERM');
  api?.close();
  service?.close();
  await opened?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

/** The React Workbench (R-100; ported in spec 074). */
const workbench = () => `${base}/app/portals/${P}/workbench?c=${CONV}`;

describe.skipIf(!browser)('the Workbench in the browser (spec 043)', { timeout: 30_000 }, () => {
  it('the live map updates from the store, with no model in between', async () => {
    const page = await browser!.newPage();
    await page.goto(workbench());
    const meter = page.locator('#t1-map .sy-meter__label');
    const here = page.locator('#t1-map [data-state="here"] .sy-film__route');
    await expect.poll(() => meter.textContent()).toContain('2 pages');
    expect(await here.textContent()).toBe('/porownanie');
    // A new page in the store: no model call, the card follows within the poll (WB-UI-13).
    // /porownanie was only recorded, never acted on, so it folds into / as a side trip.
    visit('st-3', '/kontakt', 'Kontakt');
    await expect.poll(() => meter.textContent(), { timeout: 10_000 }).toContain('3 pages');
    await expect.poll(() => here.textContent()).toBe('/kontakt');
    await page.locator('#t1-map').getByText('+1 side pages').waitFor();
    await page.close();
  });

  it('nothing runs before Confirm; Confirm stops the scan and the card says so', async () => {
    const status = () =>
      (raw().prepare(`SELECT status FROM runs WHERE id = ?`).get(RUN) as { status: string }).status;
    const page = await browser!.newPage();
    await page.goto(workbench());
    const card = page.locator('.sy-cmd');
    await expect.poll(() => card.getAttribute('data-cmd-state')).toBe('proposed');
    expect(status()).toBe('running');
    await card.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => page.locator('.sy-cmd').getAttribute('data-cmd-state')).toBe('done');
    // the 13-character short id on screen (D-9)
    await page.getByText('Stopped scan 01a110d5-0000.').waitFor({ timeout: 10_000 });
    expect(status()).toBe('interrupted');
    const audit = raw().prepare(`SELECT confirmed_by FROM workbench_commands`).get() as {
      confirmed_by: string;
    };
    expect(audit.confirmed_by).toBe('dawid');
    await page.close();
  });

  it('a message is answered over the stream', async () => {
    const page = await browser!.newPage();
    await page.goto(workbench());
    const box = page.getByRole('form', { name: 'Write to the Workbench' }).getByLabel('Message');
    await box.fill('hello there');
    await box.press('Enter');
    const log = page.getByRole('log', { name: 'Conversation' });
    await log.getByText('hello there', { exact: true }).waitFor();
    await expect.poll(() => log.textContent(), { timeout: 10_000 }).toContain('echo:');
    await page.close();
  });
});
