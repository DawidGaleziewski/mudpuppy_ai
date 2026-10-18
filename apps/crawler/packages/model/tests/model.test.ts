import { describe, expect, it } from 'vitest';
import {
  assignScreens,
  clusterPartition,
  clusterPortal,
  dominantRouteKey,
  lineageFor,
  lshCandidates,
  parameterRoles,
  paramsOf,
  routeKey,
  type ClusterState,
  type ExistingScreen,
} from '../src/index.js';

/** A MinHash signature that agrees with `base` on `same` of 128 positions. */
function sig(base: number, same: number): number[] {
  return Array.from({ length: 128 }, (_, i) => (i < same ? i : base * 1000 + i));
}

const state = (id: string, minhash: number[], routeKey = '/r'): ClusterState => ({
  id,
  fingerprint: `fp-${id}`,
  routeKey,
  minhash,
});

/** Deterministic shuffle (no Math.random in tests that must repeat). */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const NONE = { mustLink: [], cannotLink: [] };

describe('canonical clustering (design § 6.1)', () => {
  const states = [
    state('a', sig(1, 128)),
    state('b', sig(2, 124)), // 0.97 to a
    state('c', sig(3, 120)), // 0.94 to a
    state('d', sig(4, 40)), // far
    state('e', sig(5, 41)),
  ];

  it('merges near-identical states at τ 0.9 and keeps distinct ones apart', () => {
    expect(clusterPartition(states, NONE).clusters).toEqual([['a', 'b', 'c'], ['d'], ['e']]);
  });

  it('gives identical clusters whatever the insertion order (order-independence gate)', () => {
    const expected = clusterPartition(states, NONE);
    for (let seed = 1; seed <= 10; seed++)
      expect(clusterPartition(shuffled(states, seed), NONE)).toEqual(expected);
  });

  it('must-link merges first; cannot-link stops a merge', () => {
    const r = clusterPartition(states, { mustLink: [['d', 'e']], cannotLink: [['a', 'c']] });
    expect(r.clusters).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
  });

  it('reports a must-link group holding a cannot-link pair and keeps it apart', () => {
    const r = clusterPartition(states, {
      mustLink: [
        ['d', 'e'],
        ['e', 'a'],
      ],
      cannotLink: [['a', 'd']],
    });
    expect(r.conflicts).toEqual([['a', 'd', 'e']]);
    expect(r.clusters.find((c) => c.includes('d'))).toEqual(['d']);
  });

  it('never clusters across route keys', () => {
    const r = clusterPortal([state('a', sig(1, 128), '/x'), state('b', sig(1, 128), '/y')], NONE);
    expect(r.clusters).toEqual([['a'], ['b']]);
  });

  it('LSH finds pairs that share a band', () => {
    const pairs = lshCandidates([
      state('a', sig(1, 128)),
      state('b', sig(2, 8)),
      state('c', sig(3, 0)),
    ]);
    expect(pairs.has('0,1')).toBe(true);
    expect(pairs.has('0,2')).toBe(false);
  });
});

describe('stable ids and lineage (design § 6.2)', () => {
  const screens: ExistingScreen[] = [
    { id: 'S1', members: ['a', 'b', 'c'], anchoredDocs: 2, status: 'active' },
    { id: 'S2', members: ['d'], anchoredDocs: 0, status: 'active' },
    { id: 'S3', members: ['x'], anchoredDocs: 0, status: 'retired' },
  ];

  it('keeps a screen id when its members stay together', () => {
    expect(assignScreens([['a', 'b', 'c'], ['d']], screens)).toEqual(['S1', 'S2']);
  });

  it('a split keeps the id on the larger part and records the other', () => {
    const clusters = [['a', 'b'], ['c'], ['d']];
    const screenOf = assignScreens(clusters, screens);
    expect(screenOf).toEqual(['S1', null, 'S2']);
    const lineage = lineageFor(clusters, ['S1', 'S4', 'S2'], screens);
    expect(lineage).toEqual([{ kind: 'split', from: 'S1', to: 'S4', membersMoved: 1 }]);
  });

  it('a merge keeps the more documented screen and records the other as merged into it', () => {
    const clusters = [['a', 'b', 'c', 'd']];
    expect(assignScreens(clusters, screens)).toEqual(['S1']);
    expect(lineageFor(clusters, ['S1'], screens)).toEqual([
      { kind: 'merge', from: 'S2', to: 'S1', membersMoved: 1 },
    ]);
  });

  it('a screen whose members are gone is retired; a retired one that returns is revived', () => {
    const clusters = [['a', 'b', 'c'], ['x']];
    expect(assignScreens(clusters, screens)).toEqual(['S1', 'S3']);
    expect(lineageFor(clusters, ['S1', 'S3'], screens)).toEqual([
      { kind: 'retire', from: 'S2', to: null, membersMoved: 0 },
      { kind: 'revive', from: 'S3', to: 'S3', membersMoved: 0 },
    ]);
  });

  it('assigns the same ids whatever the cluster order', () => {
    const clusters = [['d'], ['a', 'b', 'c']];
    expect(assignScreens(clusters, screens)).toEqual(['S2', 'S1']);
  });
});

describe('parameter roles and route keys (design § 6.4)', () => {
  const sections = [1, 2, 3, 4, 5, 6].flatMap((n) =>
    [1, 2].map(() => ({
      routeTemplate: '/sekcja/:param',
      url: `https://p.pl/sekcja/${n}`,
      structureHash: `form-${n}`,
    })),
  );

  it('numbered sections with different forms: the path parameter is identity (scenario)', () => {
    const roles = parameterRoles(sections).get('/sekcja/:param')!;
    expect(roles.get('path:2')).toBe('identity');
    expect(routeKey('/sekcja/:param', 'https://p.pl/sekcja/3', roles)).toBe('/sekcja/3');
  });

  it('values that vary on one structure are data; a single value is ignored', () => {
    const obs = ['7', '8', '9'].map((id) => ({
      routeTemplate: '/polisa/:param',
      url: `https://p.pl/polisa/${id}?action=view&utm=x`,
      structureHash: 'same',
    }));
    const roles = parameterRoles(obs).get('/polisa/:param')!;
    expect(roles.get('path:2')).toBe('data');
    expect(roles.get('query:utm')).toBe('ignored');
    expect(routeKey('/polisa/:param', 'https://p.pl/polisa/7?action=view', roles)).toBe(
      '/polisa/:param',
    );
  });

  it('a query parameter that switches the screen is identity: action=edit vs view (R-50)', () => {
    const obs = ['edit', 'view'].flatMap((a) =>
      [1, 2].map((i) => ({
        routeTemplate: '/polisa/:param',
        url: `https://p.pl/polisa/${i}?action=${a}`,
        structureHash: a,
      })),
    );
    const roles = parameterRoles(obs).get('/polisa/:param')!;
    expect(roles.get('query:action')).toBe('identity');
    expect(routeKey('/polisa/:param', 'https://p.pl/polisa/1?action=edit', roles)).toBe(
      '/polisa/:param?action=edit',
    );
  });

  it('a person overrides any role', () => {
    const roles = parameterRoles(sections, new Map([['/sekcja/:param\u0000path:2', 'data']]));
    expect(roles.get('/sekcja/:param')!.get('path:2')).toBe('data');
  });

  it('reads path and query parameters and picks the dominant route key', () => {
    expect([...paramsOf('/a/:param/b', 'https://p.pl/a/x%20y/b?q=1').entries()]).toEqual([
      ['path:2', 'x y'],
      ['query:q', '1'],
    ]);
    expect(dominantRouteKey(['/b', '/a', '/b', '/a'])).toBe('/a');
    expect(dominantRouteKey(['/b', '/b', '/a'])).toBe('/b');
  });
});
