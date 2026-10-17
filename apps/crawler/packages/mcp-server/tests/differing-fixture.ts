import type { FixtureStore } from '@pathfinder/docs/testing';

// Spec 033 US3, research R7: a small portal with differing states, for the rule and tool tests.
// - "Calculate" on the home page led to the quote form in two guest scans and to a 503 page once;
// - "My policies" led to the account page for the client and to the sign-in page for guests;
// - a probe's press from the quote form to its validation state is explained (left out);
// - /news shows two screens (an unexplained second state); /apply's two screens are form steps
//   and /p/:param's two are items of one template (both explained).

export const P = 'diff';
/** A real-looking state id: live ids are UUIDs, which the PII token rule once flagged (F-07). */
export const DOWN_STATE = '01a14982-5871-7000-b599-4bfe9180655b';
export const T = (m: number): string => `2026-10-17T10:${String(m).padStart(2, '0')}:00.000Z`;
let db: FixtureStore['raw'];

function insert(table: string, row: Record<string, unknown>): void {
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  ).run(...cols.map((c) => row[c]));
}

function run(id: string, persona: string, minute: number): void {
  insert('runs', {
    id, portal_id: P, persona_id: persona, mode: 'map', environment: 'sandbox',
    env_version_or_date: '2026-10-17', seed_id: null, viewport: '1366x768', locale: 'pl-PL',
    browser: 'chromium', config_snapshot: '{}', status: 'completed', warning: null, steps_used: 1,
    elapsed_ms: 1, max_depth_reached: 1, started_at: T(minute), ended_at: T(minute + 1),
    coverage: null,
  }); // prettier-ignore
}

function screen(
  id: string,
  route: string,
  title: string,
  states: [string, string, string?][],
): void {
  insert('screens', {
    id, portal_id: P, route_template: route, cluster_id: `cl-${id}`, title,
    first_seen_run: 'r1', created_at: T(0),
  }); // prettier-ignore
  states.forEach(
    ([sid, kind, formStep], i) =>
    insert('states', {
      id: sid, portal_id: P, fingerprint: `fp-${sid}`, cluster_id: `cl-${id}`, route_template: route,
      title, evidence_ref: 'ev', confidence: 'observed', stabilization: 'settled',
      first_seen_run: 'r1', created_at: T(0), screen_id: id, screen_rev: i + 1,
      form_step_id: formStep ?? null, state_kind: kind,
    }), // prettier-ignore
  );
}

function seen(runId: string, stateId: string, minute: number, persona = 'guest'): void {
  insert('state_observations', {
    run_id: runId, state_id: stateId, persona_id: persona, evidence_ref: 'ev', observed_at: T(minute),
  }); // prettier-ignore
}

function move(
  id: string,
  runId: string,
  from: string,
  to: string,
  role: string,
  name: string,
  minute: number,
): void {
  insert('edges', {
    id, run_id: runId, from_state: from, to_state: to,
    action_json: JSON.stringify({ role, accessible_name: name }), safety_class: 'read',
    status: 'executed', evidence_ref: 'ev', confidence: 'observed', error: null,
    stabilization: 'settled', created_at: T(minute),
  }); // prettier-ignore
}

export function seedDiffering(raw: FixtureStore['raw']): void {
  db = raw;
  run('r1', 'guest', 0);
  run('r2', 'guest', 10);
  run('r3', 'guest', 20);
  run('r4', 'client', 30);
  db.prepare(
    `INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name, controls_json,
         label, first_seen_run, created_at) VALUES (?, ?, '/apply', ?, NULL, '[]', ?, 'r1', ?)`,
  ).run('fs-1', P, 1, 'Step 1', T(0));
  db.prepare(
    `INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name, controls_json,
         label, first_seen_run, created_at) VALUES (?, ?, '/apply', ?, NULL, '[]', ?, 'r1', ?)`,
  ).run('fs-2', P, 2, 'Step 2', T(0));
  screen('home', '/', 'Home', [['st-home', 'main']]);
  screen('quote', '/quote', 'Your quote', [['st-quote', 'main']]);
  screen('down', '/quote', 'Service unavailable', [[DOWN_STATE, 'technical']]);
  screen('quote-v', '/quote', 'Your quote', [['st-quote-v', 'validation']]);
  screen('account', '/account', 'Your policies', [['st-account', 'main']]);
  screen('login', '/login', 'Sign in', [['st-login', 'main']]);
  screen('news-a', '/news', 'News', [['st-news-a', 'main']]);
  screen('news-b', '/news', 'News archive', [['st-news-b', 'main']]);
  screen('apply-1', '/apply', 'Apply', [['st-apply-1', 'main', 'fs-1']]);
  screen('apply-2', '/apply', 'Apply', [['st-apply-2', 'main', 'fs-2']]);
  screen('p-1', '/p/:param', 'Boots', [['st-p1', 'main']]);
  screen('p-2', '/p/:param', 'Hat', [['st-p2', 'main']]);
  for (const [r, m] of [['r1', 0], ['r2', 10], ['r3', 20]] as const) seen(r, 'st-home', m); // prettier-ignore
  seen('r4', 'st-home', 30, 'client');
  move('e1', 'r1', 'st-home', 'st-quote', 'button', 'Calculate', 1);
  move('e2', 'r2', 'st-home', DOWN_STATE, 'button', 'Calculate', 11);
  move('e3', 'r3', 'st-home', 'st-quote', 'button', 'Calculate', 21);
  move('e4', 'r1', 'st-home', 'st-login', 'link', 'My policies', 2);
  move('e5', 'r4', 'st-home', 'st-account', 'link', 'My policies', 31);
  move('e6', 'r3', 'st-quote', 'st-quote-v', 'button', 'Next', 22);
  move('e7', 'r3', 'st-quote', 'st-home', 'button', 'Next', 23);
  insert('network_calls', {
    id: 'n1', run_id: 'r2', edge_id: 'e2', method: 'POST', url_template: '/quote', status: 503,
    req_schema: '{}', res_schema: '{}', console_errors: '[]', created_at: T(11), url: null,
  }); // prettier-ignore
  insert('probe_outcomes', {
    id: 'po1', run_id: 'r3', from_state_id: 'st-quote', form_step_id: null, probe_id: 'required-empty-all',
    probe_group: 'validation', target: null, inputs_json: '[]', path_json: '{}', fault: null,
    outcome_kind: 'validation', to_state_id: 'st-quote-v', accepted: 0, possible_new_process: 0,
    messages_json: '[]', http_status: null, reason: null, evidence_ref: 'ev', edge_id: 'e6',
    created_at: T(22),
  }); // prettier-ignore
  seen('r1', 'st-news-a', 3);
  seen('r2', 'st-news-b', 12);
  seen('r1', 'st-apply-1', 4);
  seen('r1', 'st-apply-2', 5);
  seen('r1', 'st-p1', 6);
  seen('r1', 'st-p2', 7);
}
