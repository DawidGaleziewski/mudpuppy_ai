import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { parse } from 'yaml';
import { AGENT_TOOL_NAMES } from '@mudpuppy/mcp-server';
import { captureInvariants } from '@mudpuppy/store';
import {
  actionNamed,
  actOn,
  gap,
  gate,
  gateServer,
  GATE_BASE,
  lastVisit,
  loginAs,
  markForProbing,
  nav,
  PROVING_GROUND,
  resetEstate,
  routeOf,
  rows,
  snapshot,
  startRun,
  type GateServer,
} from '../src/index.js';

/** The insurer logged in: hash routing, popups, wizards, legacy forms (spec 009 US6). */
let gs: GateServer;
let run: string;
beforeAll(async () => {
  await resetEstate();
  gs = await gateServer({ portals: ['proving-ground-insurer'] });
  run = await startRun(gs.call, 'proving-ground-insurer', 'client');
  await nav(gs.call, run, '/ubezpieczenia');
  await loginAs(gs.call, run);
});
afterAll(() => gs.close());

gate('LO-06', 'hash-routed screens are different states with different templates', async () => {
  const list = await nav(gs.call, run, '/ubezpieczenia#/polisy');
  const wizard = await nav(gs.call, run, '/ubezpieczenia#/szkody/nowa');
  expect(list.state_id).not.toBe(wizard.state_id);
  expect(routeOf(gs, list.state_id)).not.toBe(routeOf(gs, wizard.state_id));
});

gate(
  'LO-22',
  'a meta-refresh and JS redirect chain is followed and every hop recorded',
  async () => {
    const p = await nav(gs.call, run, '/polisa.php?id=7');
    // the navigate itself waits through the interstitial and lands on the policy screen (spec 019)
    expect(snapshot(gs, p.state_id)).toMatch(/Szczegóły polisy|polis/i);
    const v = lastVisit(gs, p.state_id);
    expect(v.hops.map((h) => h.kind)).toEqual(['start', 'meta_refresh', 'script']);
    expect(v.hops[0]!.url).toContain('/polisa.php?id=7');
    expect(v.hops[1]!.url).toContain('/stare/polisa/7');
    expect(v.url).toContain('/ubezpieczenia#/polisy/7');
  },
);

gate(
  'LO-23',
  'the old and the new URL of one screen merge into one state, both URLs recorded',
  async () => {
    const old = await nav(gs.call, run, '/polisa.php?id=7');
    const fresh = await nav(gs.call, run, '/ubezpieczenia#/polisy/7');
    expect(old.state_id).toBe(fresh.state_id);
    const titles = rows<{ title: string }>(gs, 'SELECT title FROM states').map((s) => s.title);
    expect(titles.some((t) => /Proszę czekać/i.test(t))).toBe(false);
    const entries = rows<{ hops_json: string }>(
      gs,
      'SELECT hops_json FROM observations WHERE state_id = ?',
      old.state_id,
    ).map((v) => (JSON.parse(v.hops_json) as { url: string }[])[0]?.url ?? '');
    expect(entries.some((u) => u.includes('/polisa.php?id=7'))).toBe(true);
    expect(entries.some((u) => u.includes('/ubezpieczenia#/polisy/7'))).toBe(true);
  },
);

gap(
  'LO-27',
  'a window.open pop-up is recorded as its own screen',
  'a pop-up with a URL is queued and visited (F-04@020), and since spec 080 a script-written one is kept as evidence (F-04@080), but not as a screen: the session observes only its own page',
  async () => {
    const home = await nav(gs.call, run, '/ubezpieczenia');
    await actOn(gs.call, run, home, /Ogólne warunki/);
    const titles = rows<{ title: string }>(gs, 'SELECT title FROM states').map((s) => s.title);
    expect(titles.some((t) => /warunki/i.test(t))).toBe(true);
  },
);

gate(
  'F-04@080',
  'a pop-up a script writes into (no URL) is kept as evidence the BA can cite',
  async () => {
    // A run of its own, so no earlier case's pop-up shares its decision log.
    const own = await startRun(gs.call, 'proving-ground-insurer', 'client');
    await nav(gs.call, own, '/ubezpieczenia');
    await loginAs(gs.call, own);
    const home = await nav(gs.call, own, '/ubezpieczenia');
    await actOn(gs.call, own, home, /Ogólne warunki/);
    const notes = rows<{ subject_ref: string }>(
      gs,
      "SELECT subject_ref FROM decision_log WHERE run_id = ? AND rule = 'popup_written'",
      own,
    );
    expect(notes).toHaveLength(1);
    expect(readFileSync(gs.ctx.evidence.resolve(notes[0]!.subject_ref), 'utf8')).toMatch(
      /warunki/i,
    );
  },
);

gate('LO-45', 'a spinner that never settles does not hang the call', async () => {
  const home = await nav(gs.call, run, '/ubezpieczenia');
  const start = Date.now();
  const after = await actOn(gs.call, run, home, /Porównaj oferty/);
  expect(Date.now() - start).toBeLessThan(20_000);
  expect(after.state_id).toBeTruthy();
});

gate('LO-33', 'the crawler has no browser Back that could break a server-held wizard', async () => {
  expect(AGENT_TOOL_NAMES.some((t) => /back|history/i.test(t))).toBe(false);
});

gate('LO-03', 'a cross-origin iframe in a page does not break observation', async () => {
  const w = await nav(gs.call, run, '/ubezpieczenia#/szkody/nowa');
  expect(w.state_id).toBeTruthy();
  const r = await gs.call('get_known_states', { run_id: run });
  expect(r.isError).toBe(false);
});

gate('LO-43', 'a classic form POST (no XHR) is recorded as an API shape', async () => {
  const f = await nav(gs.call, run, '/legacy/insurer/szkoda-stara.do');
  const submit = actionNamed(f, /Wyślij|Zgłoś/);
  expect(submit).toBeDefined();
  await actOn(gs.call, run, f, /Wyślij|Zgłoś/);
  const posts = rows(
    gs,
    "SELECT id FROM network_calls WHERE method = 'POST' AND url_template LIKE '%szkoda-stara%'",
  );
  expect(posts.length).toBeGreaterThan(0);
});

gate(
  'LO-47',
  'a client/server validation mismatch is recorded with both messages',
  async () => {
    // The claim date has no limit in the page; only the server knows the 30-day window. A trace
    // types an old date as a person would: the browser lets it through, the server refuses it, and
    // the step's state holds the server's message (the client side shows none: no min, no max).
    // The same with a form-probing run: F-03@038 below (the wizard keeps its step on the server).
    const own = await startRun(gs.call, 'proving-ground-insurer', 'client', {
      mode: 'trace',
      process: { name: 'Report a claim', goal: 'report a claim for an old event' },
    });
    const go = async (path: string, intent: string) => {
      const r = await gs.call('navigate', {
        run_id: own,
        url: `${GATE_BASE}${path}`,
        rationale: 'gate step',
        intent,
        include_actions: true,
      });
      expect(r.isError, JSON.stringify(r.body).slice(0, 400)).toBe(false);
      return r.body;
    };
    await go('/ubezpieczenia', 'open the portal');
    await loginAs(gs.call, own);
    const step = await go('/ubezpieczenia#/szkody/nowa', 'open the claim form');
    const dated = await actOn(gs.call, own, step, 'Data zdarzenia', {
      value: '2000-01-01',
      intent: 'an event long ago',
    });
    const refused = await actOn(gs.call, own, dated, 'Dalej', { intent: 'go to step 2' });
    expect(snapshot(gs, refused.state_id)).toContain(
      'Szkodę można zgłosić do 30 dni od zdarzenia.',
    );
  },
  { timeout: 180_000 },
);

gate(
  'F-03@038',
  'probes on a wizard that keeps its step on the server: each try in a new session when needed',
  async () => {
    // The happy press moves the server's claim to step 2, so the way back to step 1 in the same
    // session diverges; the try is done again in a new session (logged in again), where the
    // server starts the wizard at step 1. Both dates are refused by the server's 30-day window.
    const claim = await nav(gs.call, run, '/ubezpieczenia#/szkody/nowa');
    markForProbing(gs, 'proving-ground-insurer', routeOf(gs, claim.state_id));
    const own = await startRun(gs.call, 'proving-ground-insurer', 'client', { form_probing: true });
    await nav(gs.call, own, '/ubezpieczenia');
    await loginAs(gs.call, own);
    const step1 = await nav(gs.call, own, '/ubezpieczenia#/szkody/nowa');
    const skipped: string[] = [];
    for (let call = 0; call < 6; call++) {
      const r = await gs.call('probe_form', {
        run_id: own,
        action_id: actionNamed(step1, 'Dalej')!.action_id,
        probes: ['date-range'],
        rationale: 'gate: probe the claim date',
      });
      expect(r.isError, JSON.stringify(r.body).slice(0, 400)).toBe(false);
      skipped.push(...(r.body.skipped as string[]));
      if (!r.body.more) break;
    }
    expect(skipped.filter((s) => /diverged/.test(s))).toEqual([]);
    const tries = rows<{ outcome_kind: string; to_state_id: string; messages_json: string }>(
      gs,
      `SELECT outcome_kind, to_state_id, messages_json FROM probe_outcomes
       WHERE run_id = ? AND probe_id = 'date-range' ORDER BY created_at`,
      own,
    );
    expect(tries).toHaveLength(2);
    for (const t of tries) {
      expect(t.outcome_kind).toBe('validation');
      expect(snapshot(gs, t.to_state_id)).toContain('Szkodę można zgłosić do 30 dni od zdarzenia.');
      // The message is a plain <p>, no alert role: kept as text that appeared after the press
      // (F-07@038, R-80 (1), spec 045).
      expect(JSON.parse(t.messages_json)).toContainEqual({
        field: null,
        text: 'Szkodę można zgłosić do 30 dni od zdarzenia.',
        source: 'dom-text',
      });
    }
    const fresh = rows<{ n: number }>(
      gs,
      `SELECT count(*) AS n FROM decision_log WHERE run_id = ? AND rule = 'fresh_session'`,
      own,
    );
    expect(fresh[0]!.n).toBe(1);
  },
  { timeout: 240_000 },
);

gate('LO-50', 'the ground truth uses the portal clock, not the real date', async () => {
  const clock = (await (await fetch(`${GATE_BASE}/api/clock`)).json()) as { today: string };
  for (const d of ['shop', 'bank', 'insurer']) {
    const gt = parse(readFileSync(join(PROVING_GROUND, 'ground-truth', `${d}.yaml`), 'utf8')) as {
      today: string;
    };
    expect(gt.today).toBe(clock.today);
  }
});

gate(
  'LO-11',
  'the legacy claim fields carry the label text of the neighbouring table cell',
  async () => {
    const f = await nav(gs.call, run, '/legacy/insurer/szkoda-stara.do');
    const forms = rows<{ fields_json: string }>(
      gs,
      'SELECT fields_json FROM forms WHERE state_id = ?',
      f.state_id,
    );
    expect(forms.length).toBeGreaterThan(0);
    // the inputs carry name attributes, so the cell text lands in `label`, not in the name
    const fields = forms.flatMap((x) => JSON.parse(x.fields_json) as Record<string, unknown>[]);
    const labelOf = (name: string) => fields.find((x) => x.name === name)?.label;
    expect(labelOf('polisa')).toBe('Nr polisy');
    expect(labelOf('data')).toBe('Data zdarzenia');
    expect(labelOf('opis')).toBe('Opis');
  },
);

gate('LO-18', 'the div date picker "Data rozpoczęcia" can be opened and a day picked', async () => {
  const page = await nav(gs.call, run, '/ubezpieczenia#/polisy/7/dodatki');
  const trigger = (page.actions as Record<string, unknown>[]).find((a) =>
    /Data rozpoczęcia|Wybierz|\d{4}-\d{2}-\d{2}/.test(String(a.accessible_name ?? '')),
  );
  expect(
    trigger,
    `actions: ${(page.actions as Record<string, unknown>[]).map((a) => a.accessible_name).join(' | ')}`,
  ).toBeDefined();
  const opened = await actOn(gs.call, run, page, String(trigger!.accessible_name));
  const day = actionNamed(opened, /^15$/);
  expect(day, 'a day cell of the opened calendar is issued').toBeDefined();
  const picked = await actOn(gs.call, run, opened, /^15$/);
  expect(picked.state_id).not.toBe(opened.state_id);
  expect(snapshot(gs, picked.state_id)).toMatch(/\d{4}-\d{2}-15/);
});

// Last in the file: it reads everything the gates above recorded (a map run with fills, a trace,
// a form-probing run) against the M1 capture rules (spec 039 plan § 1, T023).
gate('F-41@039', 'every scan recorded what the portal model rebuilds from', async () => {
  expect(captureInvariants(gs.ctx.raw, 'proving-ground-insurer')).toEqual({
    observationsWithoutBuild: [],
    transitionsWithoutJourney: [],
    journeysWithGaps: [],
    fillsWithoutWrite: [],
    traceStepsWithoutTransition: [],
  });
});
