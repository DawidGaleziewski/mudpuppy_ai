/**
 * Row writers of the fixture store (`makeFixtureStore`): runs, states, actions, transitions, forms,
 * calls and questions, written the way the crawler server writes them. Every writer takes the next
 * id from the builder, so the call order fixes the ids (`deterministicIds`).
 */
import type { OpenedDb } from '@mudpuppy/store';

/** Fixed clock: nothing in the fixture depends on when the test runs. */
export const FIXTURE_TS = '2026-01-15T10:00:00.000Z';

/** The store being written, its id source and the state fingerprint counter. */
export interface Builder {
  raw: OpenedDb['raw'];
  nextId: () => string;
  fingerprints: number;
}

export function insert(b: Builder, table: string, row: Record<string, unknown>): void {
  const cols = Object.keys(row);
  b.raw
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((c) => row[c]));
}

export function run(
  b: Builder,
  portal: string,
  over: { mode?: string; environment?: string } = {},
): string {
  const id = b.nextId();
  insert(b, 'runs', {
    id,
    portal_id: portal,
    persona_id: 'guest',
    mode: over.mode ?? 'map',
    environment: over.environment ?? 'sandbox',
    env_version_or_date: '2026-01-15',
    seed_id: null,
    viewport: '1366x768',
    locale: 'pl-PL',
    browser: 'chromium',
    config_snapshot: '{}',
    status: 'completed',
    warning: null,
    steps_used: 12,
    elapsed_ms: 4200,
    max_depth_reached: 2,
    started_at: FIXTURE_TS,
    ended_at: FIXTURE_TS,
    coverage: null,
  });
  return id;
}

export function observe(b: Builder, runId: string, stateId: string, ref: string): void {
  insert(b, 'state_observations', {
    run_id: runId,
    state_id: stateId,
    persona_id: 'guest',
    evidence_ref: ref,
    observed_at: FIXTURE_TS,
  });
}

export function state(
  b: Builder,
  at: { portal: string; runId: string },
  { route, title, ref }: { route: string; title: string; ref: string },
): string {
  const id = b.nextId();
  b.fingerprints += 1;
  insert(b, 'states', {
    id,
    portal_id: at.portal,
    fingerprint: b.fingerprints.toString(16).padStart(64, '0'),
    cluster_id: `cluster-${b.fingerprints}`,
    route_template: route,
    title,
    evidence_ref: ref,
    confidence: 'observed',
    stabilization: 'settled',
    first_seen_run: at.runId,
    created_at: FIXTURE_TS,
  });
  observe(b, at.runId, id, ref);
  return id;
}

export const link = (name: string, href: string, snapshotRef: string) => ({
  role: 'link',
  accessible_name: name,
  locators: [{ kind: 'role', value: `role=link[name="${name}"]`, rank: 0 }],
  snapshot_ref: snapshotRef,
  nth: 0,
  href,
});

export const button = (
  name: string,
  form: { method: string; action: string },
  snapshotRef: string,
) => ({
  role: 'button',
  accessible_name: name,
  locators: [{ kind: 'role', value: `role=button[name="${name}"]`, rank: 0 }],
  snapshot_ref: snapshotRef,
  nth: 0,
  form: { method: form.method, action: form.action, hasPassword: false, purpose: 'other' },
});

export function transition(
  b: Builder,
  { runId, from, to }: { runId: string; from: string; to: string | null },
  { action, ref }: { action: object; ref: string },
  over: { safety_class?: string; status?: string } = {},
): string {
  const id = b.nextId();
  insert(b, 'transitions', {
    id,
    run_id: runId,
    from_state: from,
    to_state: to,
    action_json: JSON.stringify(action),
    safety_class: over.safety_class ?? 'read',
    status: over.status ?? 'executed',
    evidence_ref: ref,
    confidence: 'observed',
    error: null,
    stabilization: 'settled',
    created_at: FIXTURE_TS,
  });
  return id;
}

export function action(
  b: Builder,
  { runId, stateId }: { runId: string; stateId: string },
  descriptor: { role: string; accessible_name: string },
  { safetyClass, skipReason }: { safetyClass: string; skipReason: string | null },
): string {
  const id = b.nextId();
  insert(b, 'actions', {
    id,
    run_id: runId,
    state_id: stateId,
    role: descriptor.role,
    accessible_name: descriptor.accessible_name,
    action_json: JSON.stringify(descriptor),
    safety_class: safetyClass,
    allowed: skipReason === null ? 1 : 0,
    skip_reason: skipReason,
    created_at: FIXTURE_TS,
  });
  return id;
}

export function form(
  b: Builder,
  { runId, stateId }: { runId: string; stateId: string },
  fields: object,
  ref: string,
): string {
  const id = b.nextId();
  insert(b, 'forms', {
    id,
    run_id: runId,
    state_id: stateId,
    fields_json: JSON.stringify(fields),
    evidence_ref: ref,
    confidence: 'observed',
    created_at: FIXTURE_TS,
  });
  return id;
}

export function networkCall(
  b: Builder,
  { runId, transitionId }: { runId: string; transitionId: string },
  call: { method: string; urlTemplate: string; req: object; res: object },
): string {
  const id = b.nextId();
  insert(b, 'network_calls', {
    id,
    run_id: runId,
    transition_id: transitionId,
    method: call.method,
    url_template: call.urlTemplate,
    status: 200,
    req_schema: JSON.stringify(call.req),
    res_schema: JSON.stringify(call.res),
    console_errors: '[]',
    created_at: FIXTURE_TS,
  });
  return id;
}

/** A crawler question about a state (its target is a typed ref, spec 039 § 15). */
export function question(b: Builder, runId: string, text: string, aboutState: string): string {
  const id = b.nextId();
  const ref = b.nextId();
  insert(b, 'entity_refs', { id: ref, state_id: aboutState });
  insert(b, 'open_questions', {
    id,
    run_id: runId,
    text,
    ref_id: ref,
    status: 'open',
    created_at: FIXTURE_TS,
  });
  return id;
}
