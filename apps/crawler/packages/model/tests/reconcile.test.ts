import { describe, expect, it } from 'vitest';
import {
  reconcile,
  type ExistingScreen,
  type ReconcileInput,
  type ReconcileState,
  type ReconcileTransition,
  type ReconcileVisit,
} from '../src/index.js';

const sig = (base: number, same: number) =>
  Array.from({ length: 128 }, (_, i) => (i < same ? i : base * 1000 + i));

const MENU = 'link|kontakt|navigation "Menu"|';
const BODY = 'link|kontakt|main|';

function st(id: string, base: number, same: number, keys: string[], route = '/'): ReconcileState {
  return {
    id,
    fingerprint: `fp-${id}`,
    routeTemplate: route,
    structureHash: `struct-${base}`,
    minhash: sig(base, same),
    elementKeys: keys,
  };
}

function visit(id: string, run: string, state: string, at: string, build = 'B1'): ReconcileVisit {
  return {
    id,
    runId: run,
    stateId: state,
    url: 'https://p.pl/',
    at,
    audience: 'guest@sandbox',
    environment: 'sandbox',
    builds: [{ scope: 'shell', build }],
  };
}

const move = (
  id: string,
  run: string,
  from: string,
  to: string | null,
  key: string,
  at: string,
): ReconcileTransition => ({
  id,
  runId: run,
  fromState: from,
  toState: to,
  elementKey: key,
  kind: 'click',
  result: 'ok',
  createdAt: at,
});

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

const base = (): ReconcileInput => ({
  states: [
    st('home1', 1, 128, [BODY, 'button|dalej|main|']),
    st('home2', 1, 124, [BODY, 'button|dalej|main|']), // a near-duplicate of home1
    st('contact', 2, 128, ['button|wyślij|main|'], '/kontakt'),
  ],
  visits: [
    visit('v1', 'r1', 'home1', '2026-10-19T01:00:00.000Z'),
    visit('v2', 'r1', 'contact', '2026-10-19T01:00:01.000Z'),
    visit('v3', 'r2', 'home2', '2026-10-19T02:00:00.000Z'),
  ],
  transitions: [
    move('t1', 'r1', 'home1', 'contact', BODY, '2026-10-19T01:00:01.000Z'),
    move('t2', 'r2', 'home2', 'contact', BODY, '2026-10-19T02:00:01.000Z'),
  ],
  screens: [],
  constraints: { mustLink: [], cannotLink: [] },
  roleOverrides: new Map(),
  retired: new Set(),
});

describe('reconcile (spec 039 design § 7)', () => {
  it('builds screens, one model transition per action and active coverage', () => {
    const out = reconcile(base());
    // Partitions in route-key order: `/` before `/kontakt`.
    expect(out.screens.map((s) => s.members)).toEqual([['home1', 'home2'], ['contact']]);
    const homeToContact = out.transitions.filter((t) => t.elementKey === BODY);
    expect(homeToContact).toHaveLength(1);
    expect(homeToContact[0]).toMatchObject({ support: 2, status: 'active', internal: false });
  });

  it('gives the same model whatever order states, visits and transitions come in (gate)', () => {
    const expected = reconcile(base());
    for (let seed = 1; seed <= 10; seed++) {
      const b = base();
      const out = reconcile({
        ...b,
        states: shuffled(b.states, seed),
        visits: shuffled(b.visits, seed + 1),
        transitions: shuffled(b.transitions, seed + 2),
      });
      expect(out).toEqual(expected);
    }
  });

  it('keeps every screen id on a rebuild from the registry (rebuild gate)', () => {
    const first = reconcile(base());
    const registry: ExistingScreen[] = first.screens.map((s, i) => ({
      id: `S${i + 1}`,
      members: s.members,
      anchoredDocs: 0,
      status: 'active',
    }));
    const again = reconcile({ ...base(), screens: registry });
    expect(again.screens.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(again.lineage).toEqual([]);
  });

  it('run by run or all at once: the same membership (history-independence gate)', () => {
    const b = base();
    const first = reconcile({
      ...b,
      states: b.states.filter((s) => s.id !== 'home2'),
      visits: b.visits.filter((v) => v.runId === 'r1'),
      transitions: b.transitions.filter((t) => t.runId === 'r1'),
    });
    const registry: ExistingScreen[] = first.screens.map((s, i) => ({
      id: `S${i + 1}`,
      members: s.members,
      anchoredDocs: 0,
      status: 'active',
    }));
    const incremental = reconcile({ ...b, screens: registry });
    const atOnce = reconcile(b);
    expect(incremental.screens.map((s) => s.members)).toEqual(atOnce.screens.map((s) => s.members));
  });

  it('Moved link: after a release the body link is not seen since and the menu link is active', () => {
    const b = base();
    const moved = {
      ...b,
      states: [...b.states, st('home3', 1, 122, [MENU, 'button|dalej|main|'])],
      visits: [
        ...b.visits,
        visit('v4', 'r3', 'home3', '2026-10-20T01:00:00.000Z', 'B2'),
        visit('v5', 'r4', 'home3', '2026-10-21T01:00:00.000Z', 'B2'),
      ],
      transitions: [
        ...b.transitions,
        move('t3', 'r3', 'home3', 'contact', MENU, '2026-10-20T01:00:01.000Z'),
      ],
    };
    const out = reconcile(moved);
    const status = (key: string) => out.actionClasses.find((a) => a.elementKey === key)?.status;
    expect(status(MENU)).toBe('active');
    expect(status(BODY)).toBe('not_seen_since');
    // One screen pair, two action classes: the Map shows one line once R6 records `replaces`.
    expect(
      new Set(
        out.transitions
          .filter((t) => t.toScreen !== t.fromScreen)
          .map((t) => `${t.fromScreen}>${t.toScreen}`),
      ).size,
    ).toBe(1);
  });

  it('Not visited: a screen no run of the current build observed stays untested, never removed', () => {
    const b = base();
    const out = reconcile({
      ...b,
      visits: [...b.visits, visit('v4', 'r3', 'home1', '2026-10-20T01:00:00.000Z', 'B2')],
    });
    const send = out.actionClasses.find((a) => a.elementKey === 'button|wyślij|main|');
    // B2 is the release in force for the shell (design § 6.7; F-13@039 kept B1, spec 040 F-10):
    // nobody looked at this screen on B2, so it is not checked there.
    expect(send?.status).toBe('untested');
    expect(out.actionClasses.every((a) => a.status !== 'retired')).toBe(true);
  });
});
