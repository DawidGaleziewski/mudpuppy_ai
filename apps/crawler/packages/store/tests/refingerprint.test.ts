import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProfile, ROWS_V2_PROFILE } from '@pathfinder/fingerprint';
import {
  compareProfiles,
  migrateUp,
  openDb,
  reconcilePortalModel,
  refingerprintPortal,
  type OpenedDb,
} from '../src/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const T = '2026-10-20T10:00:00.000Z';
const NO_MENU = resolveProfile('no-menu', { 'no-menu': { ignore_names_in: ['navigation'] } });

/** One small page; the menu's buttons are named roles, so rows-v2 tells the two versions apart. */
const page = (menu: readonly string[]) =>
  [
    '- navigation "Menu":',
    ...menu.map((b) => `  - button "${b}"`),
    '- main:',
    '  - heading "Start" [level=1]',
  ].join('\n');

const SNAPSHOTS: Record<string, string> = {
  'a.yaml': page(['Oferta']),
  'b.yaml': page(['Oferta', 'Blog', 'Kontakt', 'Pomoc']),
};

function open(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  o.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale,
         browser, config_snapshot, status, started_at) VALUES ('r1', 'p', 'guest', 'map', 'sandbox',
         '2026-10-20', '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
    )
    .run(T);
  for (const id of ['a', 'b'])
    o.raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
           confidence, stabilization, first_seen_run, created_at)
         VALUES (?, 'p', ?, 'c', '/', 'Start', ?, 'observed', 'settled', 'r1', ?)`,
      )
      .run(id, id.repeat(64), `${id}.yaml`, T);
  return o;
}

const read = (ref: string): string | null => SNAPSHOTS[ref] ?? null;

describe('re-fingerprint and compare profiles (spec 039 T113)', () => {
  it('says which screens the no-menu profile merges', async () => {
    const o = open();
    const c = compareProfiles(o.raw, 'p', ROWS_V2_PROFILE, NO_MENU, read);
    expect(c.screens).toEqual({ a: 2, b: 1 });
    expect(c.merged).toEqual([[['a'], ['b']]]);
    expect(c.split).toEqual([]);
    expect(c.states.a).toEqual({ route: '/', title: 'Start' });
    await o.close();
  });

  it('re-fingerprints from stored snapshots, then the model has one screen', async () => {
    const o = open();
    const r = refingerprintPortal(o.raw, 'p', NO_MENU, read);
    expect(r).toMatchObject({ profile: NO_MENU.id, states: 2, updated: 2, missing: [] });
    const m = reconcilePortalModel(o.raw, 'p', { profile: NO_MENU.id, now: T });
    expect(m.stats).toMatchObject({ states: 2, screens: 1 });
    expect(
      o.raw.prepare('SELECT rules_json FROM fingerprint_profiles WHERE id = ?').get(NO_MENU.id),
    ).toBeDefined();
    await o.close();
  });

  it('changes nothing while a snapshot is missing', async () => {
    const o = open();
    const r = refingerprintPortal(o.raw, 'p', NO_MENU, (ref) =>
      ref === 'a.yaml' ? read(ref) : null,
    );
    expect(r).toMatchObject({ updated: 0, missing: ['b'] });
    expect(o.raw.prepare('SELECT count(*) AS n FROM state_components').get()).toEqual({ n: 0 });
    await o.close();
  });
});
