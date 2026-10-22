import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ModelDecisionError,
  decideHypothesis,
  hypothesisEvents,
  migrateUp,
  openDb,
  rewordHypothesis,
  ruleWording,
  undoDecision,
  type OpenedDb,
} from '../src/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const T = (s: number) => `2026-10-22T00:00:${String(s).padStart(2, '0')}.000Z`;

let o: OpenedDb | undefined;
afterEach(async () => {
  await o?.close();
  o = undefined;
});

/** A portal with model version 1 and proposed hypotheses H-0001…H-000n. */
function seed(n: number): OpenedDb {
  const db = openDb(':memory:');
  migrateUp(db.raw, MIGRATIONS);
  db.raw
    .prepare(
      `INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold, stats_json)
       VALUES ('mv1', 'shop', 1, ?, 'minhash-avglink-v1', 0.8, '{}')`,
    )
    .run(T(0));
  for (let i = 1; i <= n; i++) {
    const id = `h${i}`;
    db.raw
      .prepare(
        `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin, confidence,
           model_version_id, created_at)
         VALUES (?, ?, 'shop', 'removed', 'The basket link is gone', '{}', ?, 'agent', 'inferred', 'mv1', ?)`,
      )
      .run(id, `H-000${i}`, String(i).repeat(64).slice(0, 64), T(0));
    db.raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES (?, ?, NULL, 'proposed', 'reconciler', 'gone from the menu', ?)`,
      )
      .run(`e${i}`, id, T(1));
  }
  return db;
}

const decide = (db: OpenedDb, key: string, decision: 'confirm' | 'reject', at: number, id = 'd1') =>
  decideHypothesis(db.raw, {
    portal: 'shop',
    key,
    decision,
    actor: 'Owner',
    reason: 'checked on the page',
    decisionId: id,
    now: T(at),
  });

describe('Undo of a decision (spec 040 T010, designer § 5.4)', () => {
  it('reverts every hypothesis of one command, as new events', () => {
    o = seed(3);
    for (const k of ['H-0001', 'H-0002', 'H-0003']) decide(o, k, 'reject', 2);
    const undone = undoDecision(o.raw, {
      portal: 'shop',
      decisionId: 'd1',
      actor: 'Owner',
      now: T(3),
    });
    expect(undone).toEqual([
      { key: 'H-0001', status: 'proposed' },
      { key: 'H-0002', status: 'proposed' },
      { key: 'H-0003', status: 'proposed' },
    ]);
    const events = hypothesisEvents(o.raw, 'h2');
    expect(events.map((e) => [e.to, e.undo ?? false])).toEqual([
      ['proposed', false],
      ['rejected', false],
      ['proposed', true],
    ]);
    // Decided again after the undo: the lifecycle reads on from proposed.
    expect(decide(o, 'H-0002', 'confirm', 4, 'd2')).toBe('confirmed');
  });

  it('refuses an unknown command and a hypothesis changed since, all or nothing', () => {
    o = seed(2);
    decide(o, 'H-0001', 'confirm', 2);
    decide(o, 'H-0002', 'confirm', 2);
    // The reconciler supersedes H-0002 later: an undo would hide that move.
    o.raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES ('later', 'h2', 'confirmed', 'superseded', 'reconciler', 'a newer rule', ?)`,
      )
      .run(T(3));
    expect(() =>
      undoDecision(o!.raw, { portal: 'shop', decisionId: 'd1', actor: 'Owner', now: T(4) }),
    ).toThrow(/H-0002 changed after this decision/);
    // All or nothing: H-0001 was not undone either.
    expect(hypothesisEvents(o.raw, 'h1').at(-1)?.to).toBe('confirmed');
    expect(() =>
      undoDecision(o!.raw, { portal: 'shop', decisionId: 'nope', actor: 'Owner' }),
    ).toThrow(ModelDecisionError);
  });

  it('an undone command cannot be undone again', () => {
    o = seed(1);
    decide(o, 'H-0001', 'confirm', 2);
    undoDecision(o.raw, { portal: 'shop', decisionId: 'd1', actor: 'Owner', now: T(3) });
    expect(() =>
      undoDecision(o!.raw, { portal: 'shop', decisionId: 'd1', actor: 'Owner', now: T(4) }),
    ).toThrow(/changed after this decision/);
  });
});

describe('Reword of a rule (spec 040 T014, designer § 7.1)', () => {
  it('keeps every wording; the latest is in force', () => {
    o = seed(1);
    expect(ruleWording(o.raw, 'h1')).toBeNull();
    rewordHypothesis(o.raw, {
      portal: 'shop',
      key: 'H-0001',
      wording: 'First',
      actor: 'Owner',
      now: T(2),
    });
    rewordHypothesis(o.raw, {
      portal: 'shop',
      key: 'H-0001',
      wording: '  The driver must be 21 or older.  ',
      actor: 'Owner',
      now: T(3),
    });
    expect(ruleWording(o.raw, 'h1')?.wording).toBe('The driver must be 21 or older.');
    expect(o.raw.prepare('SELECT count(*) AS n FROM hypothesis_wordings').get()).toEqual({ n: 2 });
    expect(() =>
      rewordHypothesis(o!.raw, { portal: 'shop', key: 'H-0001', wording: ' ', actor: 'Owner' }),
    ).toThrow(/needs a sentence/);
  });
});
