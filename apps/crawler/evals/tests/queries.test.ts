import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { migrateUp, openDb } from '@pathfinder/store';
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
  expect(q.latestAnalysisSession(db, 'p', '2026-01-01')).toBeUndefined();
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
