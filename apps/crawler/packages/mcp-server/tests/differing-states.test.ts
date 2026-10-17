import { makeFixtureStore, type FixtureStore } from '@pathfinder/docs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { differingStates } from '../src/services/ba/differing-states.js';
import { P, T, fixture, seedDiffering } from './differing-fixture.js';

// Spec 033 US3, research R7: the groups of differing states on the seeded portal of
// `differing-fixture.ts`.

let fx: FixtureStore | undefined;
afterEach(async () => {
  await fx?.close();
  fx = undefined;
});

async function seed(): Promise<void> {
  fx = await makeFixtureStore({ portalId: 'other-portal' });
  seedDiffering(fx.raw);
}

const ctx = () => ({ raw: fx!.raw }) as never;

describe('differing states (spec 033 R7)', () => {
  it('finds the action and route groups and none the probes, form steps or items explain', async () => {
    await seed();
    const keys = differingStates(ctx(), P).map((g) => g.key);
    expect(keys.sort()).toEqual(
      ['action:home:button:Calculate', 'action:home:link:My policies', 'route:/news'].sort(),
    );
  });

  it('gives each outcome its scans, frequency, HTTP status and whether it came back', async () => {
    await seed();
    const calc = differingStates(ctx(), P).find((g) => g.key === 'action:home:button:Calculate')!;
    expect(calc.point).toEqual({
      screen_id: 'home',
      route: '/',
      title: 'Home',
      action: { role: 'button', name: 'Calculate' },
    });
    const byScreen = Object.fromEntries(calc.outcomes.map((o) => [o.screen_id, o]));
    expect(byScreen.quote).toMatchObject({
      frequency: { seen: 2, of: 3 },
      reproduced: true,
      state_kind: 'main',
      http_status: null,
    });
    expect(byScreen.down).toMatchObject({
      frequency: { seen: 1, of: 3 },
      reproduced: false,
      state_kind: 'technical',
      http_status: 503,
      first_seen: T(11),
    });
    expect(byScreen.down!.scans.map((s) => s.run_id)).toEqual(['r2']);
  });

  it('shows the persona behind each outcome and narrows to one route', async () => {
    await seed();
    const pol = differingStates(ctx(), P).find((g) => g.key.endsWith('My policies'))!;
    const personas = Object.fromEntries(
      pol.outcomes.map((o) => [o.route, o.scans.map((s) => s.persona)]),
    );
    expect(personas).toEqual({ '/login': ['guest'], '/account': ['client'] });
    expect(differingStates(ctx(), P, '/news').map((g) => g.key)).toEqual(['route:/news']);
    expect(differingStates(ctx(), 'nobody')).toEqual([]);
  });

  it('counts a merged screen as its target, so its group goes (owner answer Q3)', async () => {
    await seed();
    fx!.raw.prepare("UPDATE screens SET merged_into = 'news-a' WHERE id = 'news-b'").run();
    const keys = differingStates(ctx(), P).map((g) => g.key);
    expect(keys).not.toContain('route:/news');
    expect(keys).toContain('action:home:button:Calculate');
  });

  it('matches the shared fixture the dashboard reader is checked with too', async () => {
    await seed();
    const got = differingStates(ctx(), P)
      .map((g) => ({
        key: g.key,
        kind: g.kind,
        outcomes: g.outcomes
          .map((o) => ({
            screen_id: o.screen_id,
            state_id: o.state_id,
            state_kind: o.state_kind,
            seen: o.frequency.seen,
            of: o.frequency.of,
            reproduced: o.reproduced,
            http_status: o.http_status,
            personas: [...new Set(o.scans.map((s) => s.persona))].sort(),
          }))
          .sort((a, b) => a.screen_id.localeCompare(b.screen_id)),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    expect(got).toEqual(fixture.expected);
  });
});
