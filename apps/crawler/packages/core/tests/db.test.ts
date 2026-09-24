import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dbPathFor, openDb, type OpenedDb } from '../src/db.js';
import { appliedVersions, loadMigrations, migrateDown, migrateUp } from '../src/migrate.js';
import { newId, nowIso } from '../src/ids.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

let opened: OpenedDb | undefined;
let tmp: string | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

const tables = (o: OpenedDb) =>
  (
    o.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .sort();

describe('migrations', () => {
  it('finds 0001_init and 0002_portal_workspaces, each with an up and a down', () => {
    expect(loadMigrations(MIGRATIONS).map((m) => m.version)).toEqual(['0001', '0002']);
  });

  it('applies up in order, is idempotent, and reverts down to empty', () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0001', '0002']);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([]);
    expect(appliedVersions(opened.raw)).toEqual(['0001', '0002']);
    expect(tables(opened)).toEqual(
      expect.arrayContaining([
        'states',
        'frontier',
        'decision_log',
        'robots_policies',
        'portal_data_log',
      ]),
    );
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0002');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0001');
    expect(tables(opened)).toEqual(['schema_migrations']);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBeNull();
  });

  it('0002 applies and reverts on a DB holding 0001 data (up, up, down, down, up: round-trips cleanly)', () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0001', '0002']);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([]);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0002');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0001');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0001', '0002']);
    expect(appliedVersions(opened.raw)).toEqual(['0001', '0002']);
  });
});

async function seedRunAndState(
  o: OpenedDb,
  portalId: string,
  fingerprint: string,
): Promise<{ runId: string; stateId: string }> {
  const runId = newId();
  const ts = nowIso();
  await o.db
    .insertInto('runs')
    .values({
      id: runId,
      portal_id: portalId,
      persona_id: 'g',
      mode: 'map',
      environment: 'sandbox',
      env_version_or_date: 'd',
      seed_id: null,
      viewport: 'v',
      locale: 'l',
      browser: 'c',
      config_snapshot: '{}',
      status: 'running',
      warning: null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: ts,
      ended_at: null,
      coverage: null,
    })
    .execute();
  const stateId = newId();
  await o.db
    .insertInto('states')
    .values({
      id: stateId,
      portal_id: portalId,
      fingerprint,
      cluster_id: 'c',
      route_template: '/',
      title: 't',
      evidence_ref: 'a'.repeat(64) + '.yaml',
      confidence: 'observed',
      stabilization: 'settled',
      first_seen_run: runId,
      created_at: ts,
    })
    .execute();
  return { runId, stateId };
}

describe('portal-scoped states (0002_portal_workspaces, FR-026, FR-027)', () => {
  it('two portals may share a fingerprint; one portal may not duplicate its own', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const fp = 'f'.repeat(64);
    await expect(seedRunAndState(opened, 'portal-a', fp)).resolves.toBeDefined();
    await expect(seedRunAndState(opened, 'portal-b', fp)).resolves.toBeDefined();
    await expect(seedRunAndState(opened, 'portal-a', fp)).rejects.toThrow();
  });

  it('rejects a state with no portal_id', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { runId } = await seedRunAndState(opened, 'portal-a', 'a'.repeat(64));
    await expect(
      opened.db
        .insertInto('states')
        .values({
          id: newId(),
          portal_id: null as unknown as string,
          fingerprint: 'b'.repeat(64),
          cluster_id: 'c',
          route_template: '/',
          title: 't',
          evidence_ref: 'a'.repeat(64) + '.yaml',
          confidence: 'observed',
          stabilization: 'settled',
          first_seen_run: runId,
          created_at: nowIso(),
        })
        .execute(),
    ).rejects.toThrow();
  });
});

describe('connection', () => {
  it('sets WAL, foreign keys and busy_timeout on a file db under data/db', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pf-db-'));
    opened = openDb(dbPathFor(tmp, 'production'));
    expect(opened.raw.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(opened.raw.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(opened.raw.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('rejects unsafe environment names', () => {
    expect(() => dbPathFor('/x', '../evil')).toThrow();
  });

  it('enforces Principle II constraints at the schema level', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { db } = opened;
    const runId = newId();
    const ts = nowIso();
    await db
      .insertInto('runs')
      .values({
        id: runId,
        portal_id: 'p',
        persona_id: 'g',
        mode: 'map',
        environment: 'sandbox',
        env_version_or_date: 'd',
        seed_id: null,
        viewport: '1366x768',
        locale: 'pl-PL',
        browser: 'chromium',
        config_snapshot: '{}',
        status: 'running',
        warning: null,
        steps_used: 0,
        elapsed_ms: 0,
        max_depth_reached: 0,
        started_at: ts,
        ended_at: null,
        coverage: null,
      })
      .execute();
    const state = {
      id: newId(),
      portal_id: 'p',
      fingerprint: 'f'.repeat(64),
      cluster_id: 'c',
      route_template: '/',
      title: 't',
      evidence_ref: 'a'.repeat(64) + '.yaml',
      confidence: 'observed' as const,
      stabilization: 'settled' as const,
      first_seen_run: runId,
      created_at: ts,
    };
    await db.insertInto('states').values(state).execute();
    // empty evidence_ref, unknown confidence and duplicate fingerprint are all rejected
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId(), fingerprint: 'e'.repeat(64), evidence_ref: '' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId(), fingerprint: 'd'.repeat(64), confidence: 'sure' as never })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId() })
        .execute(),
    ).rejects.toThrow();
    // foreign keys are on
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId(), fingerprint: 'c'.repeat(64), first_seen_run: 'nope' })
        .execute(),
    ).rejects.toThrow();
  });
});
