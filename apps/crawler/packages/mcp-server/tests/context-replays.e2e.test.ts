import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { ACCOUNTS, startReferencePortal, type ReferencePortal } from '@mudpuppy/reference-portal';
import { createVaultStore, loadKey } from '@mudpuppy/vault';
import { replay, type ReplayPlan } from '../src/replay-driver.js';
import { replayPortal } from '../src/replay-portal.js';
import { startHarness } from './harness.js';

/**
 * Scenarios persona-variant and ab-test (spec 046, R-88; spec 039 design § 8.2 rules R4 and R5).
 * A page that looks different between two visits is walked again on the headless driver:
 * - as each persona (R4): the premium customer's extra button comes back for that customer only
 *   → `context_variant`, derived;
 * - three times as the same persona (R5): the home page's banner alternates, and the cookie
 *   `ab_baner` follows it → `ab_test` for a person, "separated by cookie:ab_baner".
 */
const available = await canLaunchBrowser();

const persona = (id: string, auth: string) =>
  `id: ${id}\n${auth}\nmax_action_class: mutating\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n`;

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
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "MudPuppy-Crawler/0.1 (local reference portal)" }
login:
  url: /logowanie
  username: { css: "input[name=login]" }
  password: { css: "input[name=haslo]" }
  submit: { role: button, name: "Zaloguj się" }
  success: { url_not_matching: "/logowanie", text: ["Zalogowano jako"] }
  failure: { text: ["Nieprawidłowy login lub hasło."] }
`;

async function setUp(scenario: 'persona-variant' | 'ab-test' | 'overlapping-rule') {
  const portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: [scenario] });
  const h = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, '')),
    'personas/reference-insurer/guest.yaml': persona('guest', 'auth: none'),
    'personas/reference-insurer/klient.yaml': persona(
      'klient',
      'auth:\n  login: ref:KLIENT_LOGIN\n  password: ref:KLIENT_PASSWORD',
    ),
    'personas/reference-insurer/klient-premium.yaml': persona(
      'klient-premium',
      'auth:\n  login: ref:PREMIUM_LOGIN\n  password: ref:PREMIUM_PASSWORD',
    ),
  });
  h.ctx.vaultKeyPath = join(mkdtempSync(join(tmpdir(), 'pf-vault-')), 'vault.key');
  const vault = createVaultStore(h.ctx.db, loadKey({ path: h.ctx.vaultKeyPath, create: true }));
  const [jan, anna] = ACCOUNTS;
  for (const [ref, value] of [
    ['KLIENT_LOGIN', jan!.login],
    ['KLIENT_PASSWORD', jan!.password],
    ['PREMIUM_LOGIN', anna!.login],
    ['PREMIUM_PASSWORD', anna!.password],
  ] as const)
    await vault.set('reference-insurer', 'sandbox', ref, value);
  return { portal, h };
}

const plan = (
  portal: ReferencePortal,
  persona: string,
  path: string,
  login: boolean,
): ReplayPlan => ({
  portal: 'reference-insurer',
  persona,
  environment: 'sandbox',
  startUrl: new URL(path, portal.url).href,
  steps: [],
  inputs: {},
  purpose: 'context-replays scenario',
  login,
});

describe.skipIf(!available)('scenario persona-variant: rule R4 (spec 046)', () => {
  let s: Awaited<ReturnType<typeof setUp>>;
  beforeAll(async () => {
    s = await setUp('persona-variant');
  });
  afterAll(async () => {
    await s?.h.cleanup();
    await s?.portal.close();
  });

  it("the premium customer's extra button is a persona variant, derived", async () => {
    const { h, portal } = s;
    const raw = h.ctx.raw;
    const a = await replay(h.call, plan(portal, 'klient', '/moje-polisy', true));
    const b = await replay(h.call, plan(portal, 'klient-premium', '/moje-polisy', true));
    expect(a.status).toBe('reached');
    expect(b.status).toBe('reached');
    const waiting = raw
      .prepare("SELECT id, kind FROM deviations WHERE status = 'waiting_test'")
      .all() as { id: string; kind: string }[];
    expect(waiting.map((w) => w.kind)).toContain('new_member');

    const report = await replayPortal(h.call, raw, 'reference-insurer');
    // The page's other version and its extra button: both explained as the persona's variant
    // (the button's reference is the standard customer's earlier visit, spec 047 F-02).
    const decided = report.contexts.filter((c) => c.hypothesis !== null);
    const hyps = decided.map((d) =>
      raw
        .prepare(
          `SELECT d.kind AS deviation, h.kind, h.rule, h.derived FROM hypotheses h
           JOIN deviations d ON d.id = h.deviation_id WHERE h.key = ?`,
        )
        .get(d.hypothesis),
    );
    expect(hyps).toEqual(
      expect.arrayContaining([
        { deviation: 'new_member', kind: 'context_variant', rule: 'R4', derived: 1 },
        { deviation: 'new_action', kind: 'context_variant', rule: 'R4', derived: 1 },
      ]),
    );
    expect(hyps).toHaveLength(2);
  }, 240_000);
});

describe.skipIf(!available)('scenario ab-test: rule R5 (spec 046)', () => {
  let s: Awaited<ReturnType<typeof setUp>>;
  beforeAll(async () => {
    s = await setUp('ab-test');
  });
  afterAll(async () => {
    await s?.h.cleanup();
    await s?.portal.close();
  });

  it('the banner that alternates by a cookie is an A/B test naming the cookie', async () => {
    const { h, portal } = s;
    const raw = h.ctx.raw;
    await replay(h.call, plan(portal, 'guest', '/', false)); // arm A
    await replay(h.call, plan(portal, 'guest', '/', false)); // arm B: another member of the home screen
    const report = await replayPortal(h.call, raw, 'reference-insurer');
    const decided = report.contexts.filter((c) => c.hypothesis !== null);
    expect(decided).toHaveLength(1);
    const hyp = raw
      .prepare(
        `SELECT h.kind, h.rule, h.derived, e.reason FROM hypotheses h
         JOIN hypothesis_events e ON e.hypothesis_id = h.id WHERE h.key = ?`,
      )
      .get(decided[0]!.hypothesis);
    expect(hyp).toEqual({
      kind: 'ab_test',
      rule: 'R5',
      derived: 0,
      reason: 'waiting for a person (rule R5): separated by cookie:ab_baner',
    });
  }, 240_000);
});

describe.skipIf(!available)('scenario overlapping-rule: rule R5 without a flag (spec 080)', () => {
  let s: Awaited<ReturnType<typeof setUp>>;
  beforeAll(async () => {
    s = await setUp('overlapping-rule');
  });
  afterAll(async () => {
    await s?.h.cleanup();
    await s?.portal.close();
  });

  it('a page drawn for manual review at random is nondeterministic, for the agent', async () => {
    const { h, portal } = s;
    const raw = h.ctx.raw;
    // Each replay loads Moje polisy twice (the login's landing, then the address): the third
    // replay's page is drawn for review, another member of the screen.
    for (let i = 0; i < 3; i++) {
      const r = await replay(h.call, plan(portal, 'klient', '/moje-polisy', true));
      expect(r.status).toBe('reached');
    }
    const report = await replayPortal(h.call, raw, 'reference-insurer');
    const decided = report.contexts.filter((c) => c.hypothesis !== null);
    expect(decided.length).toBeGreaterThan(0);
    const kinds = decided.map(
      (d) =>
        raw
          .prepare('SELECT kind, rule, derived FROM hypotheses WHERE key = ?')
          .get(d.hypothesis) as { kind: string; rule: string; derived: number },
    );
    expect(kinds).toContainEqual({ kind: 'nondeterministic', rule: 'R5', derived: 0 });
    expect(kinds.map((k) => k.kind)).not.toContain('ab_test');
  }, 240_000);
});
