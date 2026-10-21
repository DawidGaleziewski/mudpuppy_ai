import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptedTau,
  acceptTau,
  LEGACY_PROFILE,
  tauInForce,
  labelPair,
  migrateUp,
  openDb,
  pairLabelHistory,
  pairsToLabel,
  tauCalibration,
  type OpenedDb,
} from '../src/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const T = '2026-10-19T04:00:00.000Z';

/** A MinHash blob sharing its first `shared` of 128 values with the base signature. */
function blob(shared: number, salt: number): Buffer {
  const buf = Buffer.alloc(512);
  for (let i = 0; i < 128; i++) buf.writeUInt32BE(i < shared ? i : 100_000 * salt + i, i * 4);
  return buf;
}

/** Three page versions of one route: b is 91 % like a, c only 50 %; and one on another route. */
function open(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const r = o.raw;
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser,
       config_snapshot, status, started_at) VALUES ('run1', 'ins', 'guest', 'map', 'sandbox', '2026-10-19',
       '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  ).run(T);
  const state = (id: string, route: string, minhash: Buffer) => {
    r.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
         stabilization, first_seen_run, created_at) VALUES (?, 'ins', ?, 'c', ?, ?, ?, 'observed', 'settled', 'run1', ?)`,
    ).run(id, id.repeat(64).slice(0, 64), route, `Page ${id}`, `${'e'.repeat(64)}.yaml`, T);
    r.prepare(
      `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash, mounts_hash,
         minhash, element_keys) VALUES (?, ?, ?, ?, ?, ?, ?, '[]')`,
    ).run(
      id,
      's'.repeat(64),
      'c'.repeat(64),
      'o'.repeat(64),
      'a'.repeat(64),
      'm'.repeat(64),
      minhash,
    );
  };
  state('a', '/x', blob(128, 0));
  state('b', '/x', blob(116, 1)); // 116 / 128 = 0.906
  state('c', '/x', blob(64, 2)); // 0.5
  state('d', '/y', blob(116, 3)); // same values, another route: never compared
  return o;
}

describe('labelling queue and τ calibration (spec 039 T037)', () => {
  it('offers the pair nearest τ on one route, and drops it once labelled', async () => {
    const o = open();
    const q = pairsToLabel(o.raw, 'ins');
    expect(q.map((p) => [p.a.id, p.b.id, p.similarity])).toEqual([['a', 'b', 0.906]]);
    expect(q[0]!.route).toBe('/x');
    labelPair(o.raw, { portal: 'ins', a: 'b', b: 'a', label: 'distinct', actor: 'owner', now: T });
    expect(pairsToLabel(o.raw, 'ins')).toEqual([]);
    await o.close();
  });

  it("a new answer replaces the label and keeps the earlier one in the pair's history", async () => {
    const o = open();
    const at = (s: string) => `2026-10-21T10:00:${s}.000Z`;
    labelPair(o.raw, {
      portal: 'ins',
      a: 'b',
      b: 'a',
      label: 'distinct',
      actor: 'marek',
      reason: 'The banner changes the purpose.',
      now: at('01'),
    });
    labelPair(o.raw, {
      portal: 'ins',
      a: 'a',
      b: 'b',
      label: 'near_duplicate',
      ndKind: 'cosmetic',
      actor: 'owner',
      now: at('02'),
    });
    expect(o.raw.prepare('SELECT label, labelled_by FROM state_pair_labels').all()).toEqual([
      { label: 'near_duplicate', labelled_by: 'owner' },
    ]);
    expect(pairLabelHistory(o.raw, 'b', 'a')).toEqual([
      {
        label: 'distinct',
        ndKind: null,
        by: 'marek',
        at: at('01'),
        reason: 'The banner changes the purpose.',
      },
      { label: 'near_duplicate', ndKind: 'cosmetic', by: 'owner', at: at('02'), reason: null },
    ]);
    await o.close();
  });

  it('keeps the default τ until each side has enough labels, and refuses to accept none', async () => {
    const o = open();
    labelPair(o.raw, { portal: 'ins', a: 'a', b: 'b', label: 'clone', actor: 'owner', now: T });
    labelPair(o.raw, { portal: 'ins', a: 'a', b: 'c', label: 'distinct', actor: 'owner', now: T });
    expect(tauCalibration(o.raw, 'ins')).toMatchObject({
      tau: null,
      same: 1,
      distinct: 1,
      needed: 30,
    });
    expect(tauInForce(o.raw, 'ins', LEGACY_PROFILE)).toBe(0.9);
    expect(() => acceptTau(o.raw, 'ins', { by: 'owner' })).toThrow(/no calibrated τ/);
    await o.close();
  });

  it('uses the τ a person accepted for the profile, else the profile threshold (T115)', async () => {
    const o = open();
    o.raw
      .prepare(
        `INSERT INTO fingerprint_profiles (portal_id, id, name, rules_json, first_seen)
         VALUES ('ins', 'loose@0123abcd', 'loose', '{"cluster_threshold":0.8}', ?)`,
      )
      .run(T);
    expect(tauInForce(o.raw, 'ins', 'loose@0123abcd')).toBe(0.8);
    o.raw
      .prepare(
        `INSERT INTO tau_acceptances (id, portal_id, profile, tau, labels, f1, accepted_by, accepted_at)
         VALUES ('t1', 'ins', ?, 0.93, 60, 0.97, 'owner', ?)`,
      )
      .run(LEGACY_PROFILE, T);
    expect(acceptedTau(o.raw, 'ins', LEGACY_PROFILE)).toMatchObject({ tau: 0.93, labels: 60 });
    expect(tauInForce(o.raw, 'ins', LEGACY_PROFILE)).toBe(0.93);
    expect(tauInForce(o.raw, 'ins', 'loose@0123abcd')).toBe(0.8);
    await o.close();
  });

  it('never queues a pair across fingerprint profiles (T112)', async () => {
    const o = open();
    o.raw
      .prepare("UPDATE state_components SET profile = 'loose@0123abcd' WHERE state_id = 'b'")
      .run();
    expect(pairsToLabel(o.raw, 'ins')).toEqual([]);
    expect(pairsToLabel(o.raw, 'ins', { profile: 'loose@0123abcd' })).toEqual([]);
    await o.close();
  });
});
