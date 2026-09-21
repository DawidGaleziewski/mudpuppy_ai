import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { openDb, type OpenedDb } from '../src/db.js';
import { migrateUp } from '../src/migrate.js';
import { createDecisionLog, createLogger } from '../src/log.js';
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
  return { db: opened.db, runId, lines, log: createDecisionLog(opened.db, logger) };
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
