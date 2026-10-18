import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateUp, openDb, reconcilePortalModel, type OpenedDb } from '../src/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');

/** 512-byte MinHash blob agreeing with base 0 on `same` of 128 positions. */
function blob(base: number, same: number): Buffer {
  const buf = Buffer.alloc(512);
  for (let i = 0; i < 128; i++) buf.writeUInt32BE(i < same ? i : base * 1000 + i, i * 4);
  return buf;
}

const H = (c: string) => c.repeat(64);
const T = (s: number) => `2026-10-19T00:00:${String(s).padStart(2, '0')}.000Z`;

function seed(o: OpenedDb) {
  const r = o.raw;
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser,
       config_snapshot, status, started_at) VALUES ('run1', 'shop', 'guest', 'map', 'sandbox', '2026-10-19',
       '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  ).run(T(0));
  r.prepare(
    `INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES ('j1', 'run1', 'entry_url', ?)`,
  ).run(T(0));
  const state = (
    id: string,
    route: string,
    base: number,
    same: number,
    keys: string[],
    at: number,
  ) => {
    r.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
         stabilization, first_seen_run, created_at) VALUES (?, 'shop', ?, 'c', ?, ?, ?, 'observed', 'settled', 'run1', ?)`,
    ).run(id, H(id[0]!), route, `Title ${id}`, `${H('e')}.yaml`, T(at));
    r.prepare(
      `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash, mounts_hash,
         minhash, element_keys) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      H(String(base)),
      H('c'),
      H('o'),
      H('a'),
      H('m'),
      blob(base, same),
      JSON.stringify(keys),
    );
  };
  state('a', '/', 1, 128, ['link|kontakt|main|'], 1);
  state('b', '/', 1, 124, ['link|kontakt|main|'], 2);
  state('k', '/kontakt', 2, 128, ['button|wyślij|main|'], 3);
  r.prepare(
    `INSERT INTO builds (id, portal_id, scope, signature, source, assets_json, first_seen)
             VALUES ('B1', 'shop', 'shell', ?, 'assets', '[]', ?)`,
  ).run(H('b'), T(0));
  const visit = (id: string, stateId: string, seq: number) => {
    r.prepare(
      `INSERT INTO page_visits (id, run_id, state_id, edge_id, via, url, hops_json, created_at, journey_id, seq, result,
         context_key, flags_json) VALUES (?, 'run1', ?, NULL, 'navigate', 'https://shop.test/', '[]', ?, 'j1', ?, 'ok', ?, '{}')`,
    ).run(id, stateId, T(10 + seq), seq, H('x'));
    r.prepare("INSERT INTO observation_builds (page_visit_id, build_id) VALUES (?, 'B1')").run(id);
  };
  visit('v1', 'a', 1);
  visit('v2', 'k', 2);
  visit('v3', 'b', 3);
  r.prepare(
    `INSERT INTO edges (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref, confidence,
       stabilization, created_at, journey_id, seq, from_visit_id, element_key, kind, result)
     VALUES ('e1', 'run1', 'a', 'k', '{}', 'read', 'executed', ?, 'observed', 'settled', ?, 'j1', 1, 'v1',
       'link|kontakt|main|', 'click', 'ok')`,
  ).run(`${H('e')}.yaml`, T(12));
}

function open(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seed(o);
  return o;
}

describe('reconcilePortalModel (spec 039 design § 7)', () => {
  it('writes screens with SC keys, members, action classes and model transitions', async () => {
    const o = open();
    const r = reconcilePortalModel(o.raw, 'shop', { now: T(59) });
    expect(r.seq).toBe(1);
    const screens = o.raw
      .prepare('SELECT key, route_key, status FROM model_screens ORDER BY key')
      .all();
    expect(screens).toEqual([
      { key: 'SC-0001', route_key: '/', status: 'active' },
      { key: 'SC-0002', route_key: '/kontakt', status: 'active' },
    ]);
    const members = o.raw
      .prepare(
        'SELECT s.key, m.state_id, m.ordinal FROM screen_members m JOIN model_screens s ON s.id = m.screen_id ORDER BY s.key, m.ordinal',
      )
      .all();
    expect(members).toEqual([
      { key: 'SC-0001', state_id: 'a', ordinal: 1 },
      { key: 'SC-0001', state_id: 'b', ordinal: 2 },
      { key: 'SC-0002', state_id: 'k', ordinal: 1 },
    ]);
    const t = o.raw.prepare('SELECT support, internal, status FROM model_transitions').all();
    expect(t).toEqual([{ support: 1, internal: 0, status: 'active' }]);
    await o.close();
  });

  it('a second pass with nothing new writes nothing (idempotence gate)', async () => {
    const o = open();
    reconcilePortalModel(o.raw, 'shop', { now: T(59) });
    const before = o.raw.prepare('SELECT count(*) AS n FROM model_versions').get();
    const again = reconcilePortalModel(o.raw, 'shop', { now: T(59) });
    expect(again.modelVersion).toBeNull();
    expect(o.raw.prepare('SELECT count(*) AS n FROM model_versions').get()).toEqual(before);
    await o.close();
  });

  it('a rebuild keeps every screen, action class and transition id (rebuild gate)', async () => {
    const o = open();
    reconcilePortalModel(o.raw, 'shop', { now: T(59) });
    const ids = () =>
      o.raw
        .prepare(
          `SELECT (SELECT group_concat(id) FROM (SELECT id FROM model_screens ORDER BY id)) AS s,
                  (SELECT group_concat(id) FROM (SELECT id FROM action_classes ORDER BY id)) AS a,
                  (SELECT group_concat(id) FROM (SELECT id FROM model_transitions ORDER BY id)) AS t`,
        )
        .get();
    const first = ids();
    const r = reconcilePortalModel(o.raw, 'shop', { rebuild: true, now: T(59) });
    expect(r.seq).toBe(2);
    expect(ids()).toEqual(first);
    expect(o.raw.prepare('SELECT count(*) AS n FROM screen_lineage').get()).toEqual({ n: 0 });
    await o.close();
  });
});
