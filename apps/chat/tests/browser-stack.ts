// The stack the browser end-to-end files drive (spec 022): a temp store with every migration, the
// chat service's HTTP API on an ephemeral port (fake agent; amendments, proposals, processes) and
// one real dashboard (`uv run`) per reviewer name on that store. A change to this file runs the
// e2e files only (`pnpm --dir apps/chat test:e2e`).
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createEvidenceStore } from '@mudpuppy/core';
import { dbPathFor, migrateUp, openDb, type OpenedDb } from '@mudpuppy/store';
import { createAmendmentService, type AmendmentService } from '../src/amendments.js';
import { createApi, listenLocal } from '../src/api.js';
import { createProcessService } from '../src/process-service.js';
import { createProposalService } from '../src/proposal-service.js';
import { ChatService } from '../src/service.js';
import { ChatStore } from '../src/store.js';
import { fakeAgent } from './fake-agent.js';
import { MIGRATIONS } from './helpers.js';

const repo = resolve(import.meta.dirname, '../../..');
export const P = 'reference-insurer';
export const T = '2026-10-14T08:00:00.000Z';

export interface Stack {
  root: string;
  opened: OpenedDb;
  amendments: AmendmentService;
  chatBase: string;
  /** Start a dashboard signing as `reviewer`; resolves to its base URL once it answers. */
  dashboard: (reviewer: string, probePath: string) => Promise<string>;
  close: () => Promise<void>;
}

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

/** One run and recorded states `[id, route, title]` of portal P, for seeding. */
export function seedStates(
  opened: OpenedDb,
  states: readonly (readonly [string, string, string])[],
) {
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
       VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-14', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
    )
    .run(P, T);
  for (const [id, route, title] of states)
    opened.raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
         VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', 'run-1', ?)`,
      )
      .run(id, P, `fp-${id}`, route, title, T);
}

export async function startStack(name: string): Promise<Stack> {
  const root = mkdtempSync(join(tmpdir(), `mudpuppy-e2e-${name}-`));
  mkdirSync(join(root, 'data', 'db'), { recursive: true });
  const opened = openDb(dbPathFor(join(root, 'data'), 'sandbox'));
  migrateUp(opened.raw, MIGRATIONS);
  const amendments = createAmendmentService({
    db: opened.db,
    evidence: createEvidenceStore(join(root, 'data', 'evidence')),
  });
  const logError = () => Promise.resolve({ ref: 'ERR-E2E', logged: true });
  const service = new ChatService({
    store: new ChatStore(opened.db),
    launch: fakeAgent().launch,
    sessionRequest: () => ({ cwd: root, mcpServers: [] }),
    policy: () => ({ allow: true, reason: '' }),
    logError,
  });
  const api: Server = createApi({
    service,
    logError,
    findError: () => Promise.resolve(null),
    version: 'test',
    amendments,
    proposals: createProposalService({ db: opened.db, amendments }),
    processes: createProcessService({ db: opened.db }),
  });
  const chatBase = `http://127.0.0.1:${String(await listenLocal(api, 0))}`;
  const dashboards: ChildProcess[] = [];

  async function dashboard(reviewer: string, probePath: string): Promise<string> {
    const port = await freePort();
    const child = spawn('uv', ['run', '--quiet', 'mudpuppy-dashboard'], {
      cwd: join(repo, 'apps', 'dashboard'),
      env: {
        ...process.env,
        MUDPUPPY_DATA_DIR: join(root, 'data'),
        MUDPUPPY_DEFAULT_ENV: 'sandbox',
        MUDPUPPY_PORT: String(port),
        MUDPUPPY_CHAT_URL: chatBase,
        MUDPUPPY_REVIEWER: reviewer,
      },
      stdio: 'ignore',
    });
    dashboards.push(child);
    const base = `http://127.0.0.1:${String(port)}`;
    await waitUp(`${base}${probePath}`);
    return base;
  }

  return {
    root,
    opened,
    amendments,
    chatBase,
    dashboard,
    close: async () => {
      for (const d of dashboards) d.kill('SIGTERM');
      api.close();
      service.close();
      await opened.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
