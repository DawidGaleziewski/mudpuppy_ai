import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import pino from 'pino';
import { join } from 'node:path';
import { createEvidenceStore, createLogger, unzip } from '@mudpuppy/core';
import { createDecisionLog, createTracer, linkDecisions, migrateUp, openDb } from '@mudpuppy/store';
import { createBrowserRuntime, createServer, type ServerContext } from '@mudpuppy/mcp-server';
import { createVaultStore, loadKey } from '@mudpuppy/vault';
import {
  FIXTURE_PASSWORD,
  FIXTURE_USERS,
  GATE_BASE,
  GATE_PORT,
  GATE_WIDGET_PORT,
  MIGRATIONS,
  REPO,
  SCAR_BASE,
  SCAR_PORT,
} from './paths.js';

export type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- parsed JSON bodies of arbitrary shape
export type Call = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ isError: boolean; body: Body }>;

export interface GateServer {
  ctx: ServerContext & { dir: string };
  call: Call;
  /** Repo-relative-like root holding the copied portals/personas, the evidence and the key. */
  dir: string;
  close(): Promise<void>;
}

const BRAND = /^proving-ground-(shop|bank|insurer)$/;

/** Copy a portal's config with the developer ports rewritten to the gate ports. */
function copyPortal(root: string, id: string, rewrite: (yaml: string) => string): void {
  const src = join(REPO, 'portals', id, 'portal.yaml');
  mkdirSync(join(root, 'portals', id), { recursive: true });
  writeFileSync(join(root, 'portals', id, 'portal.yaml'), rewrite(readFileSync(src, 'utf8')));
  const personas = join(REPO, 'personas', id);
  if (existsSync(personas)) cpSync(personas, join(root, 'personas', id), { recursive: true });
}

export const toGatePorts = (yaml: string): string =>
  yaml
    .replaceAll('127.0.0.1:4100', `127.0.0.1:${GATE_PORT}`)
    .replaceAll('127.0.0.1:4101', `127.0.0.1:${GATE_WIDGET_PORT}`)
    .replaceAll('127.0.0.1:4300', `127.0.0.1:${SCAR_PORT}`)
    .replaceAll('127.0.0.2:4300', `127.0.0.2:${SCAR_PORT}`)
    // scar-maker's forward proxy runs on its port + 2 (spec 030 R-63).
    .replaceAll('127.0.0.1:4302', `127.0.0.1:${SCAR_PORT + 2}`)
    // Gates jump between pages with direct navigations; depth is not what they test.
    .replace(/max_depth:\s*\d+/, 'max_depth: 100')
    // A shell page pulls ~12 requests; at the configs' 5/s every step waits ~2 s (SC-006). 20/s
    // stays under the estate's own limit of 30 counted requests a second (LO-41).
    .replace(/requests_per_second:\s*\d+/, 'requests_per_second: 20')
    // Static files have their own budget (spec 030 FR-063); together they stay under 30 (LO-41).
    .replace(/(\n(\s*)requests_per_second: 20)/, '$1\n$2static_per_second: 8');

/** Scar-maker's one fixture user (apps/scar-maker `login-session.ts`), spec 030, for its portals. */
async function seedScarLogins(
  vault: ReturnType<typeof createVaultStore>,
  portals: readonly string[],
): Promise<void> {
  for (const p of portals.filter((id) => id.startsWith('scar-maker'))) {
    await vault.set(p, 'sandbox', 'SCAR_LOGIN', 'scar.tester');
    await vault.set(p, 'sandbox', 'SCAR_PASSWORD', FIXTURE_PASSWORD);
  }
}

/**
 * A crawler server exactly as the agent sees it (in-memory MCP transport, real browser runtime)
 * on a fresh sandbox database, with the proving ground's configs pointed at the gate estate and
 * the fixture users stored in a throwaway vault.
 */
export async function gateServer(
  opts: { portals?: string[]; extra?: (root: string) => void } = {},
): Promise<GateServer> {
  const dir = mkdtempSync(join(tmpdir(), 'pf-gate-'));
  const portals = opts.portals ?? [
    'proving-ground-shop',
    'proving-ground-bank',
    'proving-ground-insurer',
  ];
  cpSync(join(REPO, 'personas', '_mixins'), join(dir, 'personas', '_mixins'), { recursive: true });
  for (const p of portals) copyPortal(dir, p, toGatePorts);
  opts.extra?.(dir);

  const opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  // PF_GATE_LOG=<file> keeps the server log of a failing case (it is silent otherwise).
  const logger = process.env.PF_GATE_LOG
    ? createLogger({ level: 'warn', destination: pino.destination(process.env.PF_GATE_LOG) })
    : createLogger({ level: 'silent' });
  const evidence = createEvidenceStore(join(dir, 'data', 'evidence'));
  const tracer = createTracer({ db: opened.db, logger, evidence, level: 'standard' });
  await tracer.start({
    environment: 'sandbox',
    server: 'mudpuppy',
    version: 'gate',
  });
  const keyPath = join(dir, 'vault.key');
  const vault = createVaultStore(opened.db, loadKey({ path: keyPath, create: true }));
  const users = JSON.parse(readFileSync(FIXTURE_USERS, 'utf8')).users as {
    brand: string;
    login: string;
  }[];
  await seedScarLogins(vault, portals);
  for (const p of portals) {
    const brand = BRAND.exec(p)?.[1];
    const user = users.find((u) => u.brand === brand);
    if (!user) continue;
    const up = brand!.toUpperCase();
    await vault.set(p, 'sandbox', `PG_${up}_LOGIN`, user.login);
    await vault.set(p, 'sandbox', `PG_${up}_PASSWORD`, FIXTURE_PASSWORD);
  }

  const ctx: ServerContext & { dir: string } = {
    db: opened.db,
    raw: opened.raw,
    evidence,
    decisions: linkDecisions(createDecisionLog(opened.db, logger), tracer),
    logger,
    tracer,
    root: dir,
    dbEnvironment: 'sandbox',
    fetch,
    vaultKeyPath: keyPath,
    dir,
  };
  const runtime = createBrowserRuntime({
    // A short ceiling: the bank's SSE ticker never lets the network go idle (findings F-06).
    stabilizer: { networkIdleMs: 200, domQuietMs: 150, timeoutMs: 3000, pollMs: 25 },
  });
  const server = createServer(ctx, runtime);
  const client = new Client({ name: 'gate-agent', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call: Call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  return {
    ctx,
    call,
    dir,
    async close() {
      await runtime.closeAll();
      await tracer.shutdown();
      await opened.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Restore the estate's seed (carts, lockouts, sessions). */
export async function resetEstate(): Promise<void> {
  const r = await fetch(`${GATE_BASE}/__admin/reset`, { method: 'POST' });
  if (!r.ok) throw new Error(`reset failed: ${r.status}`);
}

/** start_run → returns the run id; throws with the error body on refusal. */
export async function startRun(
  call: Call,
  portal: string,
  persona: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const r = await call('start_run', { portal_id: portal, persona_id: persona, ...extra });
  if (r.isError) throw new Error(`start_run refused: ${JSON.stringify(r.body)}`);
  return r.body.run_id as string;
}

export async function nav(call: Call, runId: string, path: string): Promise<Body> {
  const r = await call('navigate', {
    run_id: runId,
    url: path.startsWith('http') ? path : `${GATE_BASE}${path}`,
    rationale: 'gate step',
    include_actions: true,
  });
  if (r.isError) throw new Error(`navigate ${path}: ${JSON.stringify(r.body)}`);
  return r.body;
}

/**
 * Navigate on the gate's scar-maker (spec 030): a path is taken on the portal host; `extra` adds
 * arguments (a trace run's `intent`).
 */
export async function scarNav(
  call: Call,
  runId: string,
  path: string,
  extra: Record<string, unknown> = {},
): Promise<Body> {
  const r = await call('navigate', {
    run_id: runId,
    url: path.startsWith('http') ? path : `${SCAR_BASE}${path}`,
    rationale: 'gate step',
    include_actions: true,
    ...extra,
  });
  if (r.isError) throw new Error(`navigate ${path}: ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Clear the gate scar-maker's memory (counters, sessions). */
export async function resetScars(): Promise<void> {
  const r = await fetch(`${SCAR_BASE}/__admin/reset`, { method: 'POST' });
  if (!r.ok) throw new Error(`scar reset failed: ${r.status}`);
}

/** Everything a run left in the store and the evidence folder, as one string (secret searches). */
export function everythingStored(gs: GateServer): string {
  const tables = gs.ctx.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'credentials'")
    .all() as { name: string }[];
  let out = '';
  for (const { name } of tables)
    out += JSON.stringify(gs.ctx.raw.prepare(`SELECT * FROM "${name}"`).all());
  const walk = (d: string): void => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      // Trace chunks are deflated: search what is inside them (FR-019a).
      else if (e.name.endsWith('.zip'))
        for (const entry of unzip(readFileSync(p)).values()) out += entry.toString('latin1');
      else out += readFileSync(p).toString('latin1');
    }
  };
  walk(join(gs.dir, 'data'));
  return out;
}

/** Playwright trace chunks the gate server wrote (`data/traces/…`), as paths. */
export function traceFiles(gs: GateServer): string[] {
  const dir = join(gs.dir, 'data', 'traces');
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.zip'))
    .map((f) => join(dir, f));
}

/** The ARIA snapshot evidence of a recorded state. */
export async function snapshotOf(gs: GateServer, stateId: string): Promise<string> {
  const row = await gs.ctx.db
    .selectFrom('states')
    .select('evidence_ref')
    .where('id', '=', stateId)
    .executeTakeFirstOrThrow();
  return readFileSync(gs.ctx.evidence.resolve(row.evidence_ref), 'utf8');
}

export { GATE_BASE };
