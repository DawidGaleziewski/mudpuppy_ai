import { afterEach, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startReferencePortal, type ReferencePortal } from '@pathfinder/reference-portal';
import { startHarness, type Body } from './harness.js';
import { makeCtx } from './helpers.js';

/**
 * spec 008 US5 (FR-002, FR-003, SC-006): map mode fills a form with test data before pressing
 * its submit button and reaches the page behind it; under a `read` limit nothing is filled or
 * sent. The environment label changes nothing (spec 021 SC-002).
 */

const available = await canLaunchBrowser();

type Env = 'sandbox' | 'production';
const portalYaml = (id: string, origin: string, environment: Env, limit?: string) => `
id: ${id}
base_url: ${origin}/
environment: ${environment}
${limit ? `max_action_class: ${limit}` : ''}
compliance:
  robots_checked_on: 2026-10-02
  terms_reviewed_on: 2026-10-02
  terms_reviewed_by: local test portal, no terms
scope:
  allowed_domains: [127.0.0.1]
  external_link_policy: record
  max_depth: 6
  max_states: 60
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 80
urls:
  disallowed: ["/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (local reference portal)" }
`;
const PERSONA = `id: guest
auth: none
max_action_class: external-side-effect
viewport: { width: 1280, height: 800 }
locale: pl-PL
trace_inputs:
  Imię: Testowy
`;

const portals: ReferencePortal[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const p of portals.splice(0)) await p.close();
});

async function setup(environment: Env, limit?: string) {
  const portal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  portals.push(portal);
  const origin = portal.url.replace(/\/$/, '');
  const id = environment === 'sandbox' ? 'reference-insurer' : 'reference-insurer-readonly';
  const h = await startHarness(
    {
      [`portals/${id}/portal.yaml`]: portalYaml(id, origin, environment, limit),
      [`personas/${id}/guest.yaml`]: PERSONA,
    },
    await makeCtx(),
  );
  h.ctx.dbEnvironment = environment;
  cleanups.push(h.cleanup);
  const start = await h.call('start_run', { portal_id: id, persona_id: 'guest' });
  expect(start.isError).toBe(false);
  return { ...h, portal, origin, runId: start.body.run_id as string };
}

const find = (page: Body, role: string, name: string): Body => {
  const a = ((page.actions ?? []) as Body[]).find(
    (x) => x.role === role && x.accessible_name === name,
  );
  if (!a) throw new Error(`no ${role} "${name}" in ${JSON.stringify(page).slice(0, 800)}`);
  return a;
};

describe.skipIf(!available)('map-mode form autofill (spec 008 FR-002)', () => {
  it('fills the contact form, submits it and records the confirmation page (sandbox)', async () => {
    const h = await setup('sandbox', 'external-side-effect');
    const page = (
      await h.call('navigate', { run_id: h.runId, url: `${h.origin}/kontakt`, rationale: 'x' })
    ).body;
    const sent = await h.call('act', {
      run_id: h.runId,
      action_id: find(page, 'button', 'Wyślij zapytanie').action_id,
      rationale: 'exploring the next frontier item',
    });
    expect(sent.isError).toBe(false);
    expect(sent.body.route_template).toBe('/kontakt/dziekujemy');
    const posts = h.portal.requests.filter((q) => q.method === 'POST');
    expect(posts.map((q) => q.path)).toEqual(['/kontakt']);

    const note = h.ctx.raw
      .prepare("SELECT detail_json FROM decision_log WHERE run_id = ? AND rule = 'form_autofill'")
      .get(h.runId) as { detail_json: string };
    const filled = (JSON.parse(note.detail_json) as { filled: Body[] }).filled;
    expect(filled.find((f) => f.field === 'imie')?.value).toBe('Testowy'); // persona value by label
    expect(filled.map((f) => f.field)).toEqual(
      expect.arrayContaining(['imie', 'temat', 'wiadomosc']),
    );
    const spans = h.ctx.raw
      .prepare("SELECT count(*) AS n FROM trace_spans WHERE run_id = ? AND name = 'form_autofill'")
      .get(h.runId) as { n: number };
    expect(spans.n).toBe(1);
  });

  it('reaches the next calculator step behind the vehicle form (sandbox, SC-006)', async () => {
    const h = await setup('sandbox', 'external-side-effect');
    const page = (
      await h.call('navigate', {
        run_id: h.runId,
        url: `${h.origin}/kalkulator/pojazd`,
        rationale: 'x',
      })
    ).body;
    const next = await h.call('act', {
      run_id: h.runId,
      action_id: find(page, 'button', 'Dalej').action_id,
      rationale: 'exploring the next frontier item',
    });
    expect(next.isError).toBe(false);
    expect(next.body.route_template).toBe('/kalkulator/kierowca');
  });

  it('fills and submits on production without a limit, like sandbox (spec 021 SC-002)', async () => {
    const h = await setup('production');
    const page = (
      await h.call('navigate', { run_id: h.runId, url: `${h.origin}/kontakt`, rationale: 'x' })
    ).body;
    const sent = await h.call('act', {
      run_id: h.runId,
      action_id: find(page, 'button', 'Wyślij zapytanie').action_id,
      rationale: 'exploring the next frontier item',
    });
    expect(sent.isError).toBe(false);
    expect(sent.body.route_template).toBe('/kontakt/dziekujemy');
    expect(h.portal.requests.filter((q) => q.method === 'POST').map((q) => q.path)).toEqual([
      '/kontakt',
    ]);
  });

  it('fills and sends nothing under an explicit read limit', async () => {
    const h = await setup('production', 'read');
    const page = (
      await h.call('navigate', { run_id: h.runId, url: `${h.origin}/kontakt`, rationale: 'x' })
    ).body;
    const send = find(page, 'button', 'Wyślij zapytanie');
    const r = await h.call('act', {
      run_id: h.runId,
      action_id: send.action_id,
      rationale: 'exploring the next frontier item',
    });
    expect(r.isError).toBe(true);
    expect(h.portal.requests.filter((q) => q.method !== 'GET' && q.method !== 'HEAD')).toEqual([]);
    const autofills = h.ctx.raw
      .prepare("SELECT count(*) AS n FROM trace_spans WHERE run_id = ? AND name = 'form_autofill'")
      .get(h.runId) as { n: number };
    expect(autofills.n).toBe(0);
  });
});
