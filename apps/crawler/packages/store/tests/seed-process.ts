// The threshold portal with a documented process (spec 039 T073, T075): a car page whose link
// enters the calculator in journeys j3 and j6 (the others open the calculator by URL: deep links),
// and PRC-001 whose A walks the calculator form and the price page. Shared by the process
// instance, facts and exploration tests.
import { join } from 'node:path';
import { migrateUp, openDb, type OpenedDb } from '../src/index.js';
import { seedThreshold, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const H = (c: string) => c.repeat(64);

export function seedProcess(): OpenedDb {
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
  // j3 and j6 opened the car page by URL and clicked into the form; the other journeys opened
  // the form itself by URL (deep links, owner answer 10).
  r.prepare(
    "UPDATE observations SET state_id = 'car', url = 'https://ins.test/samochod' WHERE id IN ('vf3', 'vf6')",
  ).run();
  r.prepare(
    `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, created_at, updated_at)
     VALUES ('prc', 'ins', 'PRC-001', 'Quote', 'guest', 'scoped', 1, 'new', ?, ?)`,
  ).run(T(1), T(1));
  r.prepare(
    `INSERT INTO process_models (id, process_id, label, kind, rev, created_at)
     VALUES ('va', 'prc', 'A', 'as_is', 1, ?)`,
  ).run(T(1));
  r.prepare(
    `INSERT INTO process_model_revisions (model_id, rev, base_rev, change, author, steps, created_at)
     VALUES ('va', 1, NULL, 'create', 'BA', ?, ?)`,
  ).run(JSON.stringify([{ state_id: 'form' }, { state_id: 'price' }]), T(1));
  return o;
}
