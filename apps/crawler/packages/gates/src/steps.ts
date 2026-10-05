import { readFileSync } from 'node:fs';
import { nav, type Body, type Call, type GateServer } from './harness.js';

/** `login` and insist it worked. */
export async function loginAs(call: Call, runId: string): Promise<Body> {
  const r = await call('login', { run_id: runId, rationale: 'log in as the persona' });
  if (r.isError || r.body.outcome !== 'logged_in')
    throw new Error(`login failed: ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

/** The issued action whose accessible name matches, from a navigate/act result. */
export function actionNamed(page: Body, name: string | RegExp): Body | undefined {
  return (page.actions as Body[]).find((a) =>
    typeof name === 'string' ? a.accessible_name === name : name.test(a.accessible_name ?? ''),
  );
}

/** Act on the issued action with that accessible name; throws when it was not issued. */
export async function actOn(
  call: Call,
  runId: string,
  page: Body,
  name: string | RegExp,
  extra: Record<string, unknown> = {},
): Promise<Body> {
  const a = actionNamed(page, name);
  if (!a) {
    const names = (page.actions as Body[]).map((x) => `${x.role} "${x.accessible_name}"`);
    throw new Error(
      `no issued action named ${String(name)}; issued: ${names.slice(0, 30).join(', ')}`,
    );
  }
  const r = await call('act', {
    run_id: runId,
    action_id: a.action_id,
    rationale: 'gate step',
    ...extra,
  });
  if (r.isError) throw new Error(`act ${String(name)}: ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

export const rows = <T = Record<string, unknown>>(gs: GateServer, sql: string, ...p: unknown[]) =>
  gs.ctx.raw.prepare(sql).all(...p) as T[];

/** The stored ARIA snapshot of a state. */
export function snapshot(gs: GateServer, stateId: string): string {
  const [s] = rows<{ evidence_ref: string }>(
    gs,
    'SELECT evidence_ref FROM states WHERE id = ?',
    stateId,
  );
  return readFileSync(gs.ctx.evidence.resolve(s!.evidence_ref), 'utf8');
}

export const routeOf = (gs: GateServer, stateId: string): string =>
  rows<{ route_template: string }>(
    gs,
    'SELECT route_template FROM states WHERE id = ?',
    stateId,
  )[0]!.route_template;

/** Navigate and wait a little, for timed overlays and live updates. */
export async function navWait(call: Call, runId: string, path: string, ms: number): Promise<Body> {
  const p = await nav(call, runId, path);
  await new Promise((r) => setTimeout(r, ms));
  return p;
}
