import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportSrs } from '../src/export.js';
import { evidenceStates } from '../src/scope.js';
import { loadExportModel } from '../src/render/model.js';
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '../src/testing/index.js';

/** R-30 T028 (spec 010 FR-016, SC-005): a process-scoped export cites only in-scope evidence. */
let fx: FixtureStore;

beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seedDocRecords(fx);
});
afterAll(() => fx.close());

interface JsonRecord {
  key: string;
  evidence: { target_kind: string; target_id: string }[];
  relations: { to_key: string }[];
}

function scoped(stateIds: string[]) {
  const files = exportSrs(fx.raw, fx.portalId, {
    environment: 'sandbox',
    scope: { name: 'Car quote', stateIds },
  }) as Map<string, string>;
  return JSON.parse(files.get('records.json')!) as {
    scope: { name: string; state_ids: string[] };
    records: JsonRecord[];
  };
}

describe('process-scoped export', () => {
  it('keeps only records whose every state-bearing citation is in scope (SC-005: 100%)', () => {
    const scope = [fx.states.home, fx.states.car, fx.states.vehicle];
    const json = scoped(scope);
    expect(json.scope).toEqual({ name: 'Car quote', state_ids: [...scope].sort() });
    expect(json.records.length).toBeGreaterThan(0);
    let resolvable = 0;
    for (const r of json.records)
      for (const e of r.evidence) {
        const states = evidenceStates(fx.raw, {
          target_kind: e.target_kind as never,
          target_id: e.target_id,
        } as never);
        if (states === null) continue;
        resolvable += 1;
        for (const s of states) expect(scope).toContain(s);
      }
    expect(resolvable).toBeGreaterThan(0);
  });

  it('drops records that cite an out-of-scope screen', () => {
    const all = loadExportModel(fx.raw, fx.portalId, { environment: 'sandbox', mode: 'all' });
    const citesContact = all.records
      .filter((r) =>
        r.evidence.some((e) => (evidenceStates(fx.raw, e) ?? []).includes(fx.states.contact)),
      )
      .map((r) => r.key);
    expect(citesContact.length).toBeGreaterThan(0);
    const kept = scoped([fx.states.home, fx.states.car, fx.states.vehicle]).records.map(
      (r) => r.key,
    );
    for (const key of citesContact) expect(kept).not.toContain(key);
  });

  it('keeps relations only between kept records', () => {
    const json = scoped([fx.states.home, fx.states.car, fx.states.vehicle]);
    const keys = new Set(json.records.map((r) => r.key));
    for (const r of json.records) for (const rel of r.relations) expect(keys).toContain(rel.to_key);
  });

  it('an empty scope keeps nothing that cites a screen', () => {
    const json = scoped([]);
    for (const r of json.records)
      for (const e of r.evidence) expect(evidenceStates(fx.raw, e as never) ?? []).toEqual([]);
  });

  it('leaves the unscoped export without a scope key', () => {
    const files = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' }) as Map<string, string>;
    expect(JSON.parse(files.get('records.json')!)).not.toHaveProperty('scope');
  });
});
