// FE-A04 end to end (spec 022 T026): a person applies the assistant's proposal in the dashboard
// and undoes it, in a real browser against the real dashboard and chat service on one store.
// Apply → a new amendment revision; Undo → another new revision (a restore, never a delete).
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createEvidenceStore } from '@pathfinder/core';
import { dbPathFor, migrateUp, openDb, type OpenedDb } from '@pathfinder/store';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAmendmentService } from '../src/amendments.js';
import { createApi, listenLocal } from '../src/api.js';
import { createProposalService } from '../src/proposal-service.js';
import { proposeChange } from '../src/proposals.js';
import { ChatService } from '../src/service.js';
import { ChatStore } from '../src/store.js';
import { fakeAgent } from './fake-agent.js';
import { MIGRATIONS } from './helpers.js';

const repo = resolve(import.meta.dirname, '../../..');
const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-0000000000e2';
const T = '2026-10-14T08:00:00.000Z';

const browser: Browser | null = await chromium.launch().catch(() => null);

let root: string;
let opened: OpenedDb;
let api: Server;
let service: ChatService;
let dashboard: ChildProcess | undefined;
let dashboardBase: string;
let amendmentId: string;

/** A free local port: the dashboard takes it from the environment, not from a listener. */
async function freePort(): Promise<number> {
  const probe = createServer();
  const port = await listenLocal(probe, 0);
  await new Promise((done) => probe.close(done));
  return port;
}

async function waitUp(url: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await fetch(url)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`not up: ${url}`);
}

const revisions = () =>
  opened.raw
    .prepare(
      'SELECT rev, change, author, text FROM amendment_revisions WHERE amendment_id = ? ORDER BY rev',
    )
    .all(amendmentId) as { rev: number; change: string; author: string; text: string }[];

beforeAll(async () => {
  if (!browser) return;
  root = mkdtempSync(join(tmpdir(), 'pathfinder-e2e-proposals-'));
  mkdirSync(join(root, 'data', 'db'), { recursive: true });
  opened = openDb(dbPathFor(join(root, 'data'), 'sandbox'));
  migrateUp(opened.raw, MIGRATIONS);
  const raw = opened.raw;
  raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, '', ?, ?)`,
    )
    .run(CONV, P, T, T);
  raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
       VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-14', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
    )
    .run(P, T);
  raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES ('s-offer', ?, 'fp-offer', 'c', '/oferta', 'Oferta', 'ev', 'observed', 'settled', 'run-1', ?)`,
    )
    .run(P, T);
  const amendments = createAmendmentService({
    db: opened.db,
    evidence: createEvidenceStore(join(root, 'data', 'evidence')),
  });
  const created = await amendments.create(P, {
    kind: 'note',
    target_kind: 'state',
    target_id: 's-offer',
    text: 'Show the price',
    author: 'BA',
  });
  amendmentId = created.id;
  proposeChange(raw, CONV, {
    portal: P,
    summary: 'Say the price includes tax',
    amendment_id: amendmentId,
    text: 'Show the price with tax',
  });

  const agent = fakeAgent();
  const logError = () => Promise.resolve({ ref: 'ERR-E2E', logged: true });
  service = new ChatService({
    store: new ChatStore(opened.db),
    launch: agent.launch,
    sessionRequest: () => ({ cwd: root, mcpServers: [] }),
    policy: () => ({ allow: true, reason: '' }),
    logError,
  });
  api = createApi({
    service,
    logError,
    findError: () => Promise.resolve(null),
    version: 'test',
    amendments,
    proposals: createProposalService({ db: opened.db, amendments }),
  });
  const chatBase = `http://127.0.0.1:${String(await listenLocal(api, 0))}`;

  const port = await freePort();
  dashboardBase = `http://127.0.0.1:${String(port)}`;
  dashboard = spawn('uv', ['run', '--quiet', 'pathfinder-dashboard'], {
    cwd: join(repo, 'apps', 'dashboard'),
    env: {
      ...process.env,
      PATHFINDER_DATA_DIR: join(root, 'data'),
      PATHFINDER_DEFAULT_ENV: 'sandbox',
      PATHFINDER_PORT: String(port),
      PATHFINDER_CHAT_URL: chatBase,
      PATHFINDER_UI_SALVAGE: 'all',
      PATHFINDER_REVIEWER: 'Anna',
    },
    stdio: 'ignore',
  });
  await waitUp(`${dashboardBase}/chat?conversation=${CONV}`);
}, 120_000);

afterAll(async () => {
  dashboard?.kill('SIGTERM');
  await browser?.close();
  api?.close();
  service?.close();
  await opened?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!browser)('proposals in the browser (FE-A04)', () => {
  it('Apply makes r2 and Undo restores r1 as r3; nothing changes before Apply', async () => {
    const page = await browser!.newPage();
    await page.goto(`${dashboardBase}/chat?conversation=${CONV}`);
    const card = page.locator('.sy-proposal').first();
    await card.waitFor();
    expect(revisions().map((r) => r.rev)).toEqual([1]);

    await card.getByRole('button', { name: 'Apply as r2' }).click();
    await page.locator('.sy-proposal--applied').waitFor();
    expect(revisions()).toMatchObject([
      { rev: 1, text: 'Show the price' },
      { rev: 2, author: 'Anna', text: 'Show the price with tax' },
    ]);

    await page.getByRole('button', { name: /^Undo \(restores r1 as r3\)/ }).click();
    await page.getByText('Undone by Anna').waitFor();
    const after = revisions();
    expect(after).toHaveLength(3);
    expect(after[2]).toMatchObject({ rev: 3, author: 'Anna', text: 'Show the price' });
    await page.close();
  }, 60_000);
});
