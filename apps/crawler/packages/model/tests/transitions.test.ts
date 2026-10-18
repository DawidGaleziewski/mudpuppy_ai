import { describe, expect, it } from 'vitest';
import {
  buildEpochs,
  coverageOf,
  foldTransitions,
  globalKeys,
  type LayerATransition,
  type RunLook,
  type ScopeObservation,
} from '../src/index.js';

describe('global navigation (design § 6.5)', () => {
  it('a banner or navigation key on ≥ 60 % of screens is global; a body key never is', () => {
    const menu = 'link|oc|navigation "Menu"|';
    const body = 'button|dalej|main|';
    const keys = new Map([
      ['S1', [menu, body]],
      ['S2', [menu, body]],
      ['S3', [menu, body]],
      ['S4', [body]],
      ['S5', []],
    ]);
    expect([...globalKeys(keys)]).toEqual([menu]);
    expect(globalKeys(keys, 0.8).size).toBe(0);
  });
});

describe('model transitions (design § 6.5)', () => {
  const t = (id: string, over: Partial<LayerATransition> = {}): LayerATransition => ({
    id,
    fromScreen: 'S1',
    toScreen: 'S2',
    elementKey: 'link|oc|main|',
    kind: 'click',
    result: 'ok',
    createdAt: `2026-10-19T00:00:0${id}.000Z`,
    ...over,
  });

  it('folds repeated clicks of one action into one transition with support and sightings', () => {
    const rows = foldTransitions([t('3'), t('1'), t('2')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ support: 3, firstSeen: '1', lastSeen: '3', internal: false });
  });

  it('a different target, result or element is another transition; a self-loop is internal', () => {
    const rows = foldTransitions([
      t('1'),
      t('2', { toScreen: 'S3' }),
      t('3', { result: 'technical_error' }),
      t('4', { elementKey: 'link|oc|navigation "Menu"|' }),
      t('5', { toScreen: 'S1', kind: 'fill' }),
    ]);
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.internal)).toHaveLength(1);
  });
});

describe('coverage (design § 6.6)', () => {
  const look = (run: number, over: Partial<RunLook> = {}): RunLook => ({
    runId: `r${run}`,
    runAt: `2026-10-${10 + run}`,
    audience: 'guest',
    epoch: 'E2',
    present: true,
    executed: false,
    ...over,
  });

  it('present in the current epoch: active', () => {
    expect(coverageOf([look(1)], 'E2').status).toBe('active');
  });

  it('absent in two consecutive runs of the epoch, for every audience it was on: not seen since', () => {
    const looks = [look(1), look(2, { present: false }), look(3, { present: false })];
    expect(coverageOf(looks.slice(0, 2), 'E2').status).toBe('active'); // one miss only
    expect(coverageOf(looks, 'E2').status).toBe('not_seen_since'); // present, then missed twice
    expect(coverageOf(looks.slice(1), 'E2', false).status).toBe('untested'); // never present
    const before = [
      look(1, { epoch: 'E1' }),
      look(2, { present: false }),
      look(3, { present: false }),
    ];
    expect(coverageOf(before, 'E2').status).toBe('not_seen_since');
  });

  it('not looked at in this epoch for an audience it was on: untested, never gone (Not visited)', () => {
    const looks = [look(1, { epoch: 'E1', audience: 'premium' }), look(2, { present: false })];
    expect(coverageOf(looks, 'E2').status).toBe('untested');
  });

  it('a confirmed removal retires it', () => {
    expect(coverageOf([look(1)], 'E2', true).status).toBe('retired');
  });
});

describe('build epochs (design § 6.7)', () => {
  const o = (i: number, build: string, scope = 'shell'): ScopeObservation => ({
    id: `o${i}`,
    at: `2026-10-19T00:00:${String(i).padStart(2, '0')}.000Z`,
    scope,
    environment: 'sandbox',
    build,
  });

  it('a new build seen twice in a row starts an epoch (Deployment scenario)', () => {
    const e = buildEpochs([o(1, 'A'), o(2, 'A'), o(3, 'B'), o(4, 'B')]);
    expect(e.map((x) => [x.build, x.firstObservation, x.lastObservation])).toEqual([
      ['A', 'o1', 'o2'],
      ['B', 'o3', 'o4'],
    ]);
  });

  it('one stray sighting does not start an epoch', () => {
    expect(buildEpochs([o(1, 'A'), o(2, 'B'), o(3, 'A')]).map((x) => x.build)).toEqual(['A']);
  });

  it('old and new builds alternating after the switch: overlapping (gradual rollout)', () => {
    const e = buildEpochs([o(1, 'A'), o(2, 'B'), o(3, 'B'), o(4, 'A'), o(5, 'B')]);
    expect(e.map((x) => x.build)).toEqual(['A', 'B']);
    expect(e[1]!.overlapsPrevious).toBe(true);
  });

  it('epochs are per scope', () => {
    const e = buildEpochs([
      o(1, 'A'),
      o(2, 'X', 'mfe:/quote'),
      o(3, 'A'),
      o(4, 'Y', 'mfe:/quote'),
      o(5, 'Y', 'mfe:/quote'),
    ]);
    expect(e.map((x) => `${x.scope}:${x.build}`)).toEqual([
      'mfe:/quote:X',
      'mfe:/quote:Y',
      'shell:A',
    ]);
  });
});
