import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { openDb, type OpenedDb } from '../src/db.js';
import { migrateUp } from '../src/migrate.js';
import { createDecisionLog, createLogger, linkDecisions } from '../src/log.js';
import { createEvidenceStore } from '../src/evidence.js';
import { createTracer } from '../src/trace/tracer.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newId, nowIso } from '../src/ids.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
let opened: OpenedDb | undefined;
afterEach(async () => {
  await opened?.close();
});

async function setup() {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const runId = newId();
  await opened.db
    .insertInto('runs')
    .values({
      id: runId,
      portal_id: 'p',
      persona_id: 'g',
      mode: 'map',
      environment: 'sandbox',
      env_version_or_date: 'd',
      seed_id: null,
      viewport: 'v',
      locale: 'pl-PL',
      browser: 'chromium',
      config_snapshot: '{}',
      status: 'running',
      warning: null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: nowIso(),
      ended_at: null,
      coverage: null,
    })
    .execute();
  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    destination: { write: (s: string) => void lines.push(s) },
  });
  return {
    db: opened.db,
    raw: opened.raw,
    runId,
    lines,
    logger,
    log: createDecisionLog(opened.db, logger),
  };
}

describe('decision log', () => {
  it.each(['skip', 'refuse', 'merge', 'split', 'warning'] as const)(
    'persists and mirrors a %s entry',
    async (kind) => {
      const { db, runId, lines, log } = await setup();
      const entry = await log.record({
        run_id: runId,
        kind,
        rule: 'r1',
        reason: 'because',
        subject_ref: 'x',
        detail: { a: 1 },
      });
      const rows = await db.selectFrom('decision_log').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: entry.id,
        kind,
        rule: 'r1',
        reason: 'because',
        detail_json: '{"a":1}',
      });
      const mirrored = JSON.parse(lines[0]!);
      expect(mirrored).toMatchObject({ decision: kind, run_id: runId, rule: 'r1' });
    },
  );

  it('masks PII in reasons and detail before persisting', async () => {
    const { db, runId, log } = await setup();
    await log.record({
      run_id: runId,
      kind: 'skip',
      reason: 'mail jan@example.com',
      detail: { email: 'jan@example.com' },
    });
    const row = await db.selectFrom('decision_log').selectAll().executeTakeFirstOrThrow();
    expect(row.reason).toBe('mail [email]');
    expect(row.detail_json).toBe('{"email":"[redacted]"}');
  });

  it('rejects an unknown kind or empty reason', async () => {
    const { runId, log } = await setup();
    await expect(
      log.record({ run_id: runId, kind: 'oops' as never, reason: 'x' }),
    ).rejects.toThrow();
    await expect(log.record({ run_id: runId, kind: 'skip', reason: '' })).rejects.toThrow();
  });
});

describe('linkDecisions (research §2)', () => {
  async function linked() {
    const s = await setup();
    const tracer = createTracer({
      db: s.db,
      logger: s.logger,
      evidence: createEvidenceStore(join(tmpdir(), 'pf-log-unused')),
      level: 'standard',
      flushIntervalMs: 60_000,
    });
    await tracer.start({
      environment: 'sandbox',
      server: 'pathfinder',
      version: 't',
      pwTrace: 'non_production',
    });
    const spans = () =>
      s.raw.prepare('SELECT * FROM trace_spans ORDER BY seq').all() as Record<string, unknown>[];
    return { ...s, tracer, spans, log: linkDecisions(s.log, tracer) };
  }

  it('emits an event decision under the current span with the decision id, kind and rule', async () => {
    const { runId, tracer, log, spans } = await linked();
    let entry: Awaited<ReturnType<typeof log.record>> | undefined;
    await tracer.call({ tool: 'act', runId, args: {} }, async () => {
      await tracer.phase('gate', async () => {
        entry = await log.record({
          run_id: runId,
          kind: 'refuse',
          rule: 'denylist:delete',
          reason: 'destructive',
        });
      });
    });
    const rows = spans();
    const gate = rows.find((r) => r.name === 'gate')!;
    const decision = rows.find((r) => r.name === 'decision')!;
    expect(decision).toMatchObject({
      kind: 'event',
      parent_id: gate.id,
      decision_id: entry!.id,
      run_id: runId,
    });
    expect(JSON.parse(decision.attrs_json as string)).toEqual({
      decision_id: entry!.id,
      kind: 'refuse',
      rule: 'denylist:delete',
    });
  });

  it("outside a call attaches to the run's open browser call, else between calls", async () => {
    const { runId, tracer, log, spans } = await linked();
    await log.record({
      run_id: runId,
      kind: 'note',
      rule: 'robots:Disallow: /x',
      reason: 'background request',
    });
    await tracer.flush();
    expect(spans().find((r) => r.name === 'decision')).toMatchObject({
      parent_id: null,
      between_calls: 1,
    });
  });

  it('leaves the returned entry and the decision_log row unchanged', async () => {
    const { runId, db, log } = await linked();
    const entry = await log.record({
      run_id: runId,
      kind: 'skip',
      rule: 'r',
      reason: 'mail jan@example.com',
    });
    const row = await db.selectFrom('decision_log').selectAll().executeTakeFirstOrThrow();
    expect(row).toMatchObject({ id: entry.id, kind: 'skip', rule: 'r', reason: 'mail [email]' });
    expect(entry.reason).toBe('mail [email]');
  });

  it('emits nothing when record() fails', async () => {
    const { runId, tracer, log, spans } = await linked();
    await expect(log.record({ run_id: runId, kind: 'skip', reason: '' })).rejects.toThrow();
    await tracer.flush();
    expect(spans().filter((r) => r.name === 'decision')).toEqual([]);
  });
});
