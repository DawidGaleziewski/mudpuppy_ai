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
  it('finds 0001_init, 0002_portal_workspaces and 0003_trace, each with an up and a down', () => {
    expect(loadMigrations(MIGRATIONS).map((m) => m.version)).toEqual(['0001', '0002', '0003']);
  });

  it('applies up in order, is idempotent, and reverts down to empty', () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0001', '0002', '0003']);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([]);
    expect(appliedVersions(opened.raw)).toEqual(['0001', '0002', '0003']);
    expect(tables(opened)).toEqual(
      expect.arrayContaining([
        'states',
        'frontier',
        'decision_log',
        'robots_policies',
        'portal_data_log',
        'trace_boots',
        'trace_spans',
        'agent_turns',
      ]),
    );
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0003');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0002');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0001');
    expect(tables(opened)).toEqual(['schema_migrations']);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBeNull();
  });

  it('0002 applies and reverts on a DB holding 0001 data (up, up, down, down, up: round-trips cleanly)', () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0001', '0002', '0003']);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([]);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0003');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0002');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0001');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0001', '0002', '0003']);
    expect(appliedVersions(opened.raw)).toEqual(['0001', '0002', '0003']);
  });

  it('0003_trace applies and reverts on a DB holding 0001/0002 data (up, down, up round-trips cleanly)', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0003');
    expect(tables(opened)).not.toEqual(
      expect.arrayContaining(['trace_boots', 'trace_spans', 'agent_turns']),
    );
    expect(tables(opened)).toEqual(expect.arrayContaining(['states', 'frontier', 'decision_log']));
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(['0003']);
    expect(appliedVersions(opened.raw)).toEqual(['0001', '0002', '0003']);
    expect(tables(opened)).toEqual(
      expect.arrayContaining(['trace_boots', 'trace_spans', 'agent_turns']),
    );
  });
});

describe('trace tables (0003_trace)', () => {
  // Raw better-sqlite3 statements throughout (not the Kysely `db` builder): these tables' Zod
  // schemas and Kysely types land in a separate task; this test only exercises the migration's
  // own CHECK/FK/UNIQUE constraints.
  it('enforces Principle II-style CHECKs: enums, json shape, rationale length, duration requirement', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { raw } = opened;
    const ts = nowIso();
    const bootId = newId();

    raw
      .prepare(
        `INSERT INTO trace_boots (id, started_at, ended_at, environment, server, pid, version, trace_level, pw_trace)
         VALUES (?, ?, NULL, 'sandbox', 'pathfinder', 1234, '0.0.0-test', 'standard', 'non_production')`,
      )
      .run(bootId, ts);

    // bad enum on trace_boots.server
    expect(() =>
      raw
        .prepare(
          `INSERT INTO trace_boots (id, started_at, environment, server, pid, version, trace_level, pw_trace)
           VALUES (?, ?, 'sandbox', 'other', 1, 'v', 'standard', 'non_production')`,
        )
        .run(newId(), ts),
    ).toThrow();

    const insertSpan = raw.prepare(
      `INSERT INTO trace_spans
         (id, boot_id, seq, run_id, parent_id, kind, name, status, started_at, ended_at,
          duration_ms, attrs_json, payload_ref, summary, decision_id, tool_use_id, agent_id,
          rationale, pw_trace_path, between_calls)
       VALUES (@id, @boot_id, @seq, @run_id, @parent_id, @kind, @name, @status, @started_at, @ended_at,
               @duration_ms, @attrs_json, @payload_ref, @summary, @decision_id, @tool_use_id, @agent_id,
               @rationale, @pw_trace_path, @between_calls)`,
    );
    const baseSpan = {
      id: undefined as unknown as string,
      boot_id: bootId,
      seq: undefined as unknown as number,
      run_id: null,
      parent_id: null as string | null,
      kind: 'call',
      name: 'navigate',
      status: 'ok',
      started_at: ts,
      ended_at: ts as string | null,
      duration_ms: 5 as number | null,
      attrs_json: '{}',
      payload_ref: null,
      summary: 'ok',
      decision_id: null,
      tool_use_id: 'tu_1',
      agent_id: null,
      rationale: null as string | null,
      pw_trace_path: null,
      between_calls: 0,
    };

    const spanId = newId();
    insertSpan.run({ ...baseSpan, id: spanId, seq: 1, rationale: 'checking the home page' });

    // duration_ms required on a completed call
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 2,
        tool_use_id: 'tu_2',
        duration_ms: null,
      }),
    ).toThrow();

    // rationale over 300 chars
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 3,
        tool_use_id: 'tu_3',
        status: 'running',
        ended_at: null,
        duration_ms: null,
        rationale: 'x'.repeat(301),
      }),
    ).toThrow();

    // duplicate (boot_id, seq)
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 1,
        tool_use_id: 'tu_4',
        status: 'running',
        ended_at: null,
        duration_ms: null,
      }),
    ).toThrow();

    // attrs_json must be a JSON object, not just valid JSON
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 5,
        parent_id: spanId,
        kind: 'event',
        name: 'note',
        tool_use_id: null,
        attrs_json: '[]',
      }),
    ).toThrow();

    // agent_turns: bad role enum
    expect(() =>
      raw
        .prepare(
          `INSERT INTO agent_turns
             (id, agent_id, agent_type, message_uuid, block_index, role, kind, matched, created_at, imported_at)
           VALUES (?, 'a', 'crawler', 'm1', 0, 'system', 'text', 0, ?, ?)`,
        )
        .run(newId(), ts, ts),
    ).toThrow();

    // agent_turns: duplicate (agent_id, message_uuid, block_index)
    raw
      .prepare(
        `INSERT INTO agent_turns
           (id, agent_id, agent_type, message_uuid, block_index, role, kind, text, matched, created_at, imported_at)
         VALUES (?, 'a', 'crawler', 'm1', 0, 'assistant', 'text', 'hi', 0, ?, ?)`,
      )
      .run(newId(), ts, ts);
    expect(() =>
      raw
        .prepare(
          `INSERT INTO agent_turns
             (id, agent_id, agent_type, message_uuid, block_index, role, kind, text, matched, created_at, imported_at)
           VALUES (?, 'a', 'crawler', 'm1', 0, 'user', 'text', 'dup', 0, ?, ?)`,
        )
        .run(newId(), ts, ts),
    ).toThrow();
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
