import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  migrateUp,
  openDb,
  processTraceVariants,
  reconcilePortalModel,
  type OpenedDb,
} from '../src/index.js';
import { seedThreshold, T } from './seed-threshold.js';

// Spec 039 T073 (design § 13.1): instances of a documented process, written on reconcile.

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const H = (c: string) => c.repeat(64);

/** The threshold portal plus a car page whose link enters the calculator in journeys j3 and j6. */
function seeded(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  const r = o.raw;
  r.prepare(
    `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
       stabilization, first_seen_run, created_at) VALUES ('car', 'ins', ?, 'c', '/samochod', 'car', ?, 'observed', 'settled', 'run1', ?)`,
  ).run(H('k'), `${H('e')}.yaml`, T(0));
  const blob = Buffer.alloc(512);
  for (let i = 0; i < 128; i++) blob.writeUInt32BE(9000 + i, i * 4);
  r.prepare(
    `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash, mounts_hash,
       minhash, element_keys) VALUES ('car', ?, ?, ?, ?, ?, ?, '[]')`,
  ).run(H('9'), H('c'), H('o'), H('a'), H('m'), blob);
  for (const j of ['j3', 'j6'])
    r.prepare(
      `INSERT INTO transitions (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref,
         confidence, stabilization, created_at, journey_id, seq, element_key, kind, result)
       VALUES (?, 'run1', 'car', 'form', '{}', 'read', 'executed', ?, 'observed', 'settled', ?, ?, 1, 'link|Oblicz', 'click', 'ok')`,
    ).run(`in-${j}`, `${H('e')}.yaml`, T(5), j);
  // The documented process: A walks the calculator form and the price page.
  r.prepare(
    `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, created_at, updated_at)
     VALUES ('prc', 'ins', 'PRC-001', 'Quote', 'guest', 'scoped', 1, 'new', ?, ?)`,
  ).run(T(1), T(1));
  r.prepare(
    `INSERT INTO process_models (id, process_id, label, kind, rev, created_at)
     VALUES ('va', 'prc', 'A', 'as_is', 1, ?)`,
  ).run(T(1));
  r.prepare(
    `INSERT INTO process_model_revisions (variant_id, rev, base_rev, change, author, steps, created_at)
     VALUES ('va', 1, NULL, 'create', 'BA', ?, ?)`,
  ).run(JSON.stringify([{ state_id: 'form' }, { state_id: 'price' }]), T(1));
  return o;
}

describe('process instances (T073)', () => {
  it('writes one instance per trigger with its outcome, and reads the trace variants', async () => {
    const o = seeded();
    const done = reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    expect(done.instances).toBe(2);
    const rows = o.raw
      .prepare(
        `SELECT i.journey_id, i.trigger_transition_id, i.outcome, s.key AS screen
         FROM process_instances i LEFT JOIN model_screens s ON s.id = i.outcome_screen_id
         WHERE i.model_version_id = ? ORDER BY i.journey_id`,
      )
      .all(done.modelVersion) as Record<string, string>[];
    expect(rows.map((r) => [r.journey_id, r.trigger_transition_id, r.outcome])).toEqual([
      ['j3', 'in-j3', 'exited'], // a minor: the refusal page is not part of the process
      ['j6', 'in-j6', 'completed'],
    ]);
    const variants = processTraceVariants(o.raw, 'ins', 'PRC-001');
    // Equal counts: ordered by the screen sequence (code-unit order), the shorter first.
    expect(variants.map((v) => [v.outcome, v.count, v.screens.length])).toEqual([
      ['exited', 1, 1],
      ['completed', 1, 2],
    ]);
    expect(variants[1]!.screens.every((k) => /^SC-\d{4}$/.test(k))).toBe(true);
    await o.close();
  });
});
