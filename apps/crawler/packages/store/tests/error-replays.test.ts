import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  migrateUp,
  openDb,
  pendingErrorReplays,
  reconcilePortalModel,
  resolveErrorReplays,
  type OpenedDb,
} from '../src/index.js';
import { seedThreshold, SUBMIT, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');

/** The seeded portal with its first submit ended in a server error, and R1 waiting on it. */
function withWaitingError(): { o: OpenedDb; deviation: string } {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  o.raw.prepare("UPDATE edges SET result = 'technical_error' WHERE id = 'e0'").run();
  reconcilePortalModel(o.raw, 'ins', { now: T(500) });
  const ids = o.raw
    .prepare(
      `SELECT s.id AS screen, a.id AS class, v.id AS version FROM screen_members m
       JOIN model_screens s ON s.id = m.screen_id JOIN action_classes a ON a.screen_id = s.id
       JOIN model_versions v ON v.portal_id = s.portal_id WHERE m.state_id = 'form' AND a.element_key = ?`,
    )
    .get(SUBMIT) as { screen: string; class: string; version: string };
  o.raw
    .prepare(
      `INSERT INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id, action_class_id,
         before_json, after_json, status, created_at)
       VALUES ('dev1', 'ins', ?, 'result_mismatch', 'result_mismatch:x', ?, ?, ?, ?, 'waiting_test', ?)`,
    )
    .run(
      ids.version,
      ids.screen,
      ids.class,
      JSON.stringify({ toScreen: 'exit', result: 'ok' }),
      JSON.stringify({ toScreen: 'exit', result: 'technical_error' }),
      T(501),
    );
  return { o, deviation: 'dev1' };
}

describe('rule R1 replays (spec 039 design § 8.2)', () => {
  it('plans two replays of the failing execution with the inputs it typed', async () => {
    const { o } = withWaitingError();
    const [p] = pendingErrorReplays(o.raw, 'ins');
    expect(p).toMatchObject({ deviationId: 'dev1', repeats: 2 });
    expect(p!.plan).toMatchObject({
      persona: 'guest',
      startUrl: 'https://ins.test/kalkulator/kierowca',
      steps: [SUBMIT],
      inputs: { 'input.data_urodzenia': '2010-03-01' },
    });
    expect(pendingErrorReplays(o.raw, 'ins', { limit: 1 })).toEqual([]); // two runs do not fit
    await o.close();
  });

  it('a replay that succeeds makes the error flaky, derived; the deviation is explained', async () => {
    const { o, deviation } = withWaitingError();
    const key = resolveErrorReplays(o.raw, 'ins', deviation, ['technical_error', 'ok'], T(600));
    const h = o.raw.prepare('SELECT kind, rule, derived FROM hypotheses WHERE key = ?').get(key);
    expect(h).toEqual({ kind: 'flaky', rule: 'R1', derived: 1 });
    expect(o.raw.prepare("SELECT status FROM deviations WHERE id = 'dev1'").get()).toEqual({
      status: 'explained',
    });
    expect(pendingErrorReplays(o.raw, 'ins')).toEqual([]);
    await o.close();
  });

  it('replays that never reached the step leave it waiting', async () => {
    const { o, deviation } = withWaitingError();
    expect(resolveErrorReplays(o.raw, 'ins', deviation, [null, null])).toBeNull();
    expect(pendingErrorReplays(o.raw, 'ins')).toHaveLength(1);
    await o.close();
  });
});
