import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { migrateUp, openDb } from '@mudpuppy/store';
import { afterAll, beforeAll, expect, it } from 'vitest';
import * as q from '../queries.js';

// Every query runs against the real, migrated schema: a renamed column fails here, not after a
// paid eval run.
const migrations = resolve(import.meta.dirname, '../../../../data/migrations');
const dir = mkdtempSync(join(tmpdir(), 'pf-eval-queries-'));
let opened: ReturnType<typeof openDb>;

beforeAll(() => {
  opened = openDb(join(dir, 'store.sqlite'));
  migrateUp(opened.raw, migrations);
});
afterAll(async () => {
  await opened.close();
  rmSync(dir, { recursive: true, force: true });
});

it('answers on an empty store', () => {
  const db = opened.raw;
  expect(q.latestCrawlRun(db, 'p', 'guest', '2026-01-01')).toBeUndefined();
  expect(q.analysisSessions(db, 'p', '2026-01-01')).toEqual([]);
  expect(q.runEnd(db, 'r')).toBeUndefined();
  expect(q.pendingFrontierCount(db, 'r')).toBe(0);
  expect(q.decisionCount(db, 'r', 'login')).toBe(0);
  expect(q.observedRoutes(db, 'r')).toEqual([]);
  expect(q.compositions(db, 'r')).toEqual([]);
  expect(q.executedActions(db, 'r')).toEqual([]);
  expect(q.actionCallUrls(db, 'r')).toEqual([]);
  expect(q.traceStepRoutes(db, 'r')).toEqual([]);
  expect(q.traceOutcome(db, 'r')).toBeNull();
});

it('lists the BA sessions since the trial started, the map one first (spec 025 F-12)', () => {
  const db = opened.raw;
  const add = db.prepare(
    "INSERT INTO analysis_sessions (id, portal_id, status, passes_json, started_at) VALUES (?, 'p', ?, '[]', ?)",
  );
  add.run('old', 'interrupted', '2026-01-01T00:00:00Z');
  add.run('traces', 'running', '2026-02-01T00:02:00Z');
  add.run('map', 'interrupted', '2026-02-01T00:01:00Z');
  expect(q.analysisSessions(db, 'p', '2026-02-01')).toEqual([
    { id: 'map', status: 'interrupted' },
    { id: 'traces', status: 'running' },
  ]);
});
