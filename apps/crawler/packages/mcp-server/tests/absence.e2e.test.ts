import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import {
  startReferencePortal,
  type ReferencePortal,
  type ScenarioId,
} from '@pathfinder/reference-portal';
import { replay } from '../src/replay-driver.js';
import { startHarness } from './harness.js';

/**
 * Rule R6 end to end (spec 039 design § 8.2; scenarios removed-link and renamed-button): an
 * action two runs in a row no longer find is missing. A release removed it → removed, derived;
 * a new action on the same screen leads where it led → replaces, derived. Runs are probe runs
 * (headless, no LLM); the release is served on a fresh port, as in the Deployment test.
 */
const available = await canLaunchBrowser();

const PERSONA =
  'id: guest\nauth: none\nmax_action_class: mutating\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

const portalYaml = (origin: string) => `
id: reference-insurer
base_url: ${origin}/
environment: sandbox
compliance:
  robots_checked_on: 2026-10-02
  terms_reviewed_on: 2026-10-02
  terms_reviewed_by: local test portal, no terms
scope:
  allowed_domains: [127.0.0.1]
  external_link_policy: record
  max_depth: 50
  max_states: 60
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 10
urls:
  disallowed: ["/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (local reference portal)" }
`;

type Harness = Awaited<ReturnType<typeof startHarness>>;

/** A portal and a store; `release` serves the scenario on a fresh port. */
async function setup() {
  let portal: ReferencePortal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  const h: Harness = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, '')),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
  return {
    h,
    url: (path: string) => new URL(path, portal.url).href,
    release: async (scenario: ScenarioId) => {
      await portal.close();
      portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: [scenario] });
      writeFileSync(
        join(h.ctx.root, 'portals/reference-insurer/portal.yaml'),
        portalYaml(portal.url.replace(/\/$/, '')),
      );
    },
    close: async () => {
      await h.cleanup();
      await portal.close();
    },
  };
}

/** One probe run that only looks at a page; returns its actions' names and element keys. */
async function look(h: Harness, url: string): Promise<Map<string, string>> {
  const start = await h.call('start_run', {
    portal_id: 'reference-insurer',
    persona_id: 'guest',
    mode: 'probe',
    replay: { inputs: {} },
  });
  expect(start.isError, JSON.stringify(start.body)).toBeFalsy();
  const runId = start.body.run_id as string;
  const page = await h.call('navigate', {
    run_id: runId,
    url,
    rationale: 'look',
    include_actions: true,
  });
  await h.call('finish_run', { run_id: runId, rationale: 'looked' });
  expect(page.isError, JSON.stringify(page.body)).toBeFalsy();
  const actions = page.body.actions as { accessible_name: string | null; element_key: string }[];
  return new Map(actions.map((a) => [a.accessible_name ?? '', a.element_key]));
}

function r6Facts(h: Harness) {
  return h.ctx.raw
    .prepare(
      `SELECT h.kind, h.rule, h.derived, d.status FROM deviations d JOIN hypotheses h ON h.deviation_id = d.id
       WHERE d.kind = 'missing_action'`,
    )
    .all();
}

describe.skipIf(!available)('rule R6 on absent actions (spec 039 T052)', () => {
  it('a link a release removed is removed, derived', async () => {
    const s = await setup();
    try {
      expect((await look(s.h, s.url('/'))).has('Przedłuż polisę')).toBe(true);
      await s.release('removed-link');
      for (let i = 0; i < 2; i++)
        expect((await look(s.h, s.url('/'))).has('Przedłuż polisę')).toBe(false);
      expect(r6Facts(s.h)).toEqual([
        { kind: 'removed', rule: 'R6', derived: 1, status: 'explained' },
      ]);
    } finally {
      await s.close();
    }
  }, 120_000);

  it('a link moved from the page into the menu replaces the old one, derived', async () => {
    const s = await setup();
    try {
      const press = async (key: string) => {
        const r = await replay(s.h.call, {
          portal: 'reference-insurer',
          persona: 'guest',
          environment: 'sandbox',
          startUrl: s.url('/'),
          steps: [key],
          inputs: {},
          purpose: 'moved-link scenario',
        });
        expect(r.status, JSON.stringify(r)).toBe('reached');
      };
      const before = (await look(s.h, s.url('/'))).get('Przedłuż polisę')!;
      expect(before).toContain('main');
      await press(before);
      await s.release('moved-link');
      const after = (await look(s.h, s.url('/'))).get('Przedłuż polisę')!;
      expect(after).not.toBe(before); // the container is part of the key
      await press(after);
      expect(r6Facts(s.h)).toEqual([
        { kind: 'replaces', rule: 'R6', derived: 1, status: 'explained' },
      ]);
    } finally {
      await s.close();
    }
  }, 120_000);

  it('a button renamed in place replaces the old one, derived', async () => {
    const s = await setup();
    try {
      // Read on every use: the release moves the portal to another port.
      const vehicle = () => s.url('/kalkulator/pojazd');
      const press = async (key: string) => {
        const r = await replay(s.h.call, {
          portal: 'reference-insurer',
          persona: 'guest',
          environment: 'sandbox',
          startUrl: vehicle(),
          steps: [key],
          inputs: { 'input.model': 'Corolla' },
          purpose: 'renamed-button scenario',
        });
        expect(r.status, JSON.stringify(r)).toBe('reached');
      };
      const keyOf = async (name: string) => {
        const seen = await look(s.h, vehicle());
        expect(seen.has(name), `${name}: ${JSON.stringify([...seen.keys()])}`).toBe(true);
        return seen.get(name)!;
      };
      await press(await keyOf('Dalej'));
      await s.release('renamed-button');
      await press(await keyOf('Przejdź dalej'));
      expect(r6Facts(s.h)).toEqual([
        { kind: 'replaces', rule: 'R6', derived: 1, status: 'explained' },
      ]);
      // One change: the new button is explained by the same fact, it does not wait for a person.
      const renamed = s.h.ctx.raw
        .prepare(
          `SELECT d.status FROM deviations d JOIN action_classes a ON a.id = d.action_class_id
           WHERE d.kind = 'new_action' AND a.element_key LIKE 'button|przejdź dalej|%'`,
        )
        .all();
      expect(renamed).toEqual([{ status: 'explained' }]);
      // Seen first, pressed later: one class per element, the placeholder folded (F-24).
      const classes = s.h.ctx.raw
        .prepare("SELECT kind FROM action_classes WHERE element_key LIKE 'button|przejdź dalej|%'")
        .all();
      expect(classes).toEqual([{ kind: 'submit' }]);
    } finally {
      await s.close();
    }
  }, 120_000);
});
