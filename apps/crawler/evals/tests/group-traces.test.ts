import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/store';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { EvalConfig } from '../config.js';
import { groupTraceRuns } from '../harness/group-traces.js';

// The narrow step the owner does before documenting traces (F-20@034), on the real schema.
const migrations = resolve(import.meta.dirname, '../../../../data/migrations');
const ws = mkdtempSync(join(tmpdir(), 'pf-eval-group-'));
const c = { portal: 'p', persona: 'guest', env: 'sandbox' } as EvalConfig;
const at = '2026-10-17T00:00:00.000Z';

beforeAll(async () => {
  const path = dbPathFor(join(ws, 'data'), c.env);
  mkdirSync(dirname(path), { recursive: true });
  const opened = openDb(path);
  const db = opened.raw;
  migrateUp(db, migrations);
  db.pragma('foreign_keys = OFF');
  db.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
       locale, browser, config_snapshot, started_at)
     VALUES ('r1', 'p', 'guest', 'trace', 'sandbox', 'd', 'v', 'l', 'b', '{}', ?)`,
  ).run(at);
  const state = db.prepare(
    `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
       confidence, stabilization, first_seen_run, created_at) VALUES (?, 'p', ?, 'c', ?, ?, 'e.yaml', 'observed', 'settled', 'r1', ?)`,
  );
  state.run('s-home', 'f1', '/', 'Home', at);
  state.run('s-form', 'f2', '/form', 'Form', at);
  db.prepare(
    `INSERT INTO processes (id, run_id, portal_id, persona_id, name, goal, status, created_at)
     VALUES ('pr1', 'r1', 'p', 'guest', 'Buy', 'g', 'recorded', ?)`,
  ).run(at);
  db.prepare(
    `INSERT INTO process_steps (id, process_id, ord, intent, kind, state_before, state_after,
       outcomes_json, evidence_ref, confidence, created_at)
     VALUES ('ps1', 'pr1', 1, 'open form', 'click', 's-home', 's-form', '[]', 'e.yaml', 'observed', ?)`,
  ).run(at);
  await opened.close();
});
afterAll(() => rmSync(ws, { recursive: true, force: true }));

it('groups each trace run as a workspace process with the screens it walked; skips an empty one', async () => {
  const grouped = await groupTraceRuns(c, ws, [
    { name: 'Buy a thing', runId: 'r1' },
    { name: 'Nothing walked', runId: 'r2' },
  ]);
  expect(grouped).toEqual([{ key: 'PRC-001', name: 'Buy a thing', runId: 'r1' }]);
  const opened = openDb(dbPathFor(join(ws, 'data'), c.env));
  try {
    const row = opened.raw
      .prepare(
        `SELECT p.name, p.stage, v.label, r.steps, r.run_id FROM ba_processes p
         JOIN process_models v ON v.process_id = p.id
         JOIN process_model_revisions r ON r.variant_id = v.id`,
      )
      .get() as { name: string; stage: string; label: string; steps: string; run_id: string };
    expect(row).toMatchObject({ name: 'Buy a thing', stage: 'scoped', label: 'A', run_id: 'r1' });
    expect((JSON.parse(row.steps) as { state_id: string }[]).map((s) => s.state_id)).toEqual([
      's-home',
      's-form',
    ]);
  } finally {
    await opened.close();
  }
});
