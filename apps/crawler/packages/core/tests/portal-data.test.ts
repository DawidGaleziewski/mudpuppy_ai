import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type OpenedDb } from '../src/db.js';
import { newId, nowIso } from '../src/ids.js';
import { migrateUp } from '../src/migrate.js';
import {
  PortalDataError,
  PORTAL_TABLES,
  deletePortal,
  exportPortal,
  planPortalDelete,
} from '../src/portal-data.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
let opened: OpenedDb | undefined;
let dir: string | undefined;
afterEach(async () => {
  await opened?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  opened = undefined;
  dir = undefined;
});

const ref = (c: string, ext = 'yaml') => `${c.repeat(64)}.${ext}`;
const SHARED = ref('a'); // the same cookie page on both portals
const SHOP_ONLY = ref('b');
const INSURER_ONLY = ref('c');
const SHOP_ROBOTS = ref('d', 'json');
const SHOP_SNAPSHOT = ref('e'); // referenced only inside edges.action_json

/** Two portals in one database: `shop` (to export and delete) and `insurer` (must stay untouched). */
function seed() {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  dir = mkdtempSync(join(tmpdir(), 'pf-portal-data-'));
  const evidence = join(dir, 'evidence');
  mkdirSync(evidence);
  for (const r of [SHARED, SHOP_ONLY, INSURER_ONLY, SHOP_ROBOTS, SHOP_SNAPSHOT])
    writeFileSync(join(evidence, r), `content of ${r}`);
  const raw = opened.raw;
  const ts = nowIso();
  const run = (portal: string, status = 'completed') => {
    const id = newId();
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, seed_id, viewport,
         locale, browser, config_snapshot, status, warning, steps_used, elapsed_ms, max_depth_reached, started_at,
         ended_at, coverage) VALUES (?, ?, 'guest', 'map', 'sandbox', 'd', NULL, 'v', 'pl-PL', 'chromium', '{}', ?,
         NULL, 0, 0, 0, ?, NULL, NULL)`,
      )
      .run(id, portal, status, ts);
    return id;
  };
  const state = (portal: string, runId: string, evidenceRef: string) => {
    const id = newId();
    raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
         confidence, stabilization, first_seen_run, created_at)
         VALUES (?, ?, ?, 'c1', '/cookies', 'Pliki cookie', ?, 'observed', 'settled', ?, ?)`,
      )
      .run(id, portal, 'f'.repeat(64), evidenceRef, runId, ts);
    raw
      .prepare(
        `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at) VALUES (?, ?, 'guest', ?, ?)`,
      )
      .run(runId, id, evidenceRef, ts);
    return id;
  };
  const note = (runId: string) =>
    raw
      .prepare(
        `INSERT INTO decision_log (id, run_id, kind, rule, reason, subject_ref, detail_json, created_at)
         VALUES (?, ?, 'note', 'robots:Disallow: /api/', 'page request', '/api/x', NULL, ?)`,
      )
      .run(newId(), runId, ts);

  const shopRun = run('shop');
  const shopState = state('shop', shopRun, SHARED);
  const shopState2 = state2('shop', shopRun, SHOP_ONLY);
  raw
    .prepare(
      `INSERT INTO edges (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref,
       confidence, stabilization, error, created_at)
       VALUES (?, ?, ?, ?, ?, 'read', 'executed', ?, 'observed', 'settled', NULL, ?)`,
    )
    .run(
      newId(),
      shopRun,
      shopState,
      shopState2,
      JSON.stringify({ role: 'link', snapshot_ref: SHOP_SNAPSHOT }),
      SHOP_ONLY,
      ts,
    );
  raw
    .prepare(
      `INSERT INTO robots_policies (id, run_id, host, source_url, final_url, outcome, http_status, product_token,
       group_used, crawl_delay_s, ignored_lines, truncated, content_sha256, evidence_ref, fetched_at)
       VALUES (?, ?, 'shop.pl', 'https://shop.pl/robots.txt', NULL, 'no_rules', 404, 'PathfinderAI-Crawler',
       NULL, NULL, 0, 0, NULL, ?, ?)`,
    )
    .run(newId(), shopRun, SHOP_ROBOTS, ts);
  note(shopRun);

  const insurerRun = run('insurer');
  state('insurer', insurerRun, SHARED);
  state2('insurer', insurerRun, INSURER_ONLY);
  note(insurerRun);

  function state2(portal: string, runId: string, evidenceRef: string) {
    const id = newId();
    raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
         confidence, stabilization, first_seen_run, created_at)
         VALUES (?, ?, ?, 'c2', '/', 'Start', ?, 'observed', 'settled', ?, ?)`,
      )
      .run(id, portal, '9'.repeat(64), evidenceRef, runId, ts);
    return id;
  }

  return { raw, evidence, shopRun, insurerRun, run };
}

/** Every row of a portal, per table, as JSON, for byte-identity checks. */
function snapshotOf(raw: OpenedDb['raw'], portal: string): string {
  const out: Record<string, unknown[]> = {};
  for (const t of PORTAL_TABLES) {
    const sql =
      t === 'runs' || t === 'states'
        ? `SELECT * FROM ${t} WHERE portal_id = ? ORDER BY 1`
        : `SELECT * FROM ${t} WHERE run_id IN (SELECT id FROM runs WHERE portal_id = ?) ORDER BY 1`;
    out[t] = raw.prepare(sql).all(portal);
  }
  return JSON.stringify(out);
}

describe('portal export (spec 002 FR-028, contracts/operator-cli.md)', () => {
  it('writes a manifest, one NDJSON file per table and the referenced evidence, only of that portal', () => {
    const s = seed();
    const out = join(dir!, 'export');
    const r = exportPortal({
      raw: s.raw,
      evidenceDir: s.evidence,
      portal: 'shop',
      environment: 'sandbox',
      outDir: out,
      operator: 'qa',
    });
    expect(r.counts).toMatchObject({
      runs: 1,
      states: 2,
      state_observations: 1,
      edges: 1,
      decision_log: 1,
      robots_policies: 1,
    });
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({
      portal_id: 'shop',
      environment: 'sandbox',
      counts: r.counts,
      evidence_files: 4,
      schema_version: '0002',
    });
    expect(typeof manifest.exported_at).toBe('string');
    for (const t of PORTAL_TABLES) expect(existsSync(join(out, `${t}.ndjson`))).toBe(true);
    const runs = readFileSync(join(out, 'runs.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(runs.map((x) => x.id)).toEqual([s.shopRun]);
    expect(readdirSync(join(out, 'evidence')).sort()).toEqual(
      [SHARED, SHOP_ONLY, SHOP_ROBOTS, SHOP_SNAPSHOT].sort(),
    );
    expect(readFileSync(join(out, 'states.ndjson'), 'utf8')).not.toContain('insurer');
    const log = s.raw.prepare('SELECT * FROM portal_data_log').all() as Record<string, unknown>[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      portal_id: 'shop',
      action: 'export',
      operator: 'qa',
      target: out,
    });
  });

  it('refuses a portal without runs and writes nothing', () => {
    const s = seed();
    const out = join(dir!, 'none');
    expect(() =>
      exportPortal({
        raw: s.raw,
        evidenceDir: s.evidence,
        portal: 'ghost',
        environment: 'sandbox',
        outDir: out,
        operator: 'qa',
      }),
    ).toThrow(PortalDataError);
    expect(existsSync(out)).toBe(false);
    expect(s.raw.prepare('SELECT count(*) AS n FROM portal_data_log').get()).toEqual({ n: 0 });
  });
});

describe('portal delete (spec 002 FR-028, SC-008)', () => {
  it('plans the delete: row counts, evidence to remove and evidence kept for another portal', () => {
    const s = seed();
    const plan = planPortalDelete({ raw: s.raw, evidenceDir: s.evidence, portal: 'shop' });
    expect(plan.counts).toMatchObject({ runs: 1, states: 2, edges: 1, robots_policies: 1 });
    expect(plan.evidenceToRemove.sort()).toEqual([SHOP_ONLY, SHOP_ROBOTS, SHOP_SNAPSHOT].sort());
    expect(plan.evidenceKept).toEqual([SHARED]);
    expect(plan.running).toEqual([]);
    // planning changes nothing
    expect(snapshotOf(s.raw, 'shop')).toContain(s.shopRun);
  });

  it('refuses while a run of that portal is running', () => {
    const s = seed();
    s.run('shop', 'running');
    expect(() =>
      deletePortal({
        raw: s.raw,
        evidenceDir: s.evidence,
        portal: 'shop',
        environment: 'sandbox',
        operator: 'qa',
      }),
    ).toThrow(/running/);
    expect(snapshotOf(s.raw, 'shop')).toContain(s.shopRun);
  });

  it('removes every row and unshared evidence file of the portal and nothing of the other', () => {
    const s = seed();
    const before = snapshotOf(s.raw, 'insurer');
    const insurerFiles = [SHARED, INSURER_ONLY].map((f) =>
      readFileSync(join(s.evidence, f), 'utf8'),
    );
    const r = deletePortal({
      raw: s.raw,
      evidenceDir: s.evidence,
      portal: 'shop',
      environment: 'sandbox',
      operator: 'qa',
    });
    expect(r.counts.runs).toBe(1);
    const gone = JSON.parse(snapshotOf(s.raw, 'shop')) as Record<string, unknown[]>;
    for (const rows of Object.values(gone)) expect(rows).toEqual([]);
    expect(snapshotOf(s.raw, 'insurer')).toBe(before);
    expect(readdirSync(s.evidence).sort()).toEqual([SHARED, INSURER_ONLY].sort());
    expect([SHARED, INSURER_ONLY].map((f) => readFileSync(join(s.evidence, f), 'utf8'))).toEqual(
      insurerFiles,
    );
    const log = s.raw
      .prepare("SELECT * FROM portal_data_log WHERE action = 'delete'")
      .all() as Record<string, unknown>[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      portal_id: 'shop',
      environment: 'sandbox',
      operator: 'qa',
      target: null,
    });
    expect(JSON.parse(log[0]!.counts_json as string)).toMatchObject({
      rows: { runs: 1, states: 2 },
      evidence_removed: 3,
      evidence_kept: 1,
    });
    // the log survives a second delete of the same portal
    deletePortal({
      raw: s.raw,
      evidenceDir: s.evidence,
      portal: 'shop',
      environment: 'sandbox',
      operator: 'qa',
    });
    expect(s.raw.prepare('SELECT count(*) AS n FROM portal_data_log').get()).toEqual({ n: 2 });
  });
});
