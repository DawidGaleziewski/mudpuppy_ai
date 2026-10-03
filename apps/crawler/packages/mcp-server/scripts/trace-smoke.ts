/**
 * Scripted trace runs on the reference portal through the REAL `pathfinder` server entrypoint
 * (stdio, the command `.mcp.json` uses), making the same tool calls the crawler agent makes in
 * trace mode. A check of R-14 end to end on a real store, without an LLM in the loop.
 *
 * Usage (from apps/crawler, reference portal running on :4010 — `pnpm reference-portal`):
 *   pnpm trace:smoke                 # sandbox traces of the calculator, travel quote, comparison
 *   pnpm trace:smoke --production    # one trace on reference-insurer-readonly (boundary expected)
 *   pnpm trace:smoke --followups     # link the sandbox traces to FUP-001..003 when they are open
 * Prints one line per trace and exits 1 when an outcome is not the expected one.
 */
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ORIGIN = 'http://127.0.0.1:4010';
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const production = process.argv.includes('--production');
const withFollowups = process.argv.includes('--followups');

const client = new Client({ name: 'trace-smoke', version: '0' });
await client.connect(
  new StdioClientTransport({
    command: 'pnpm',
    args: ['--silent', '--dir', SERVER_DIR, 'start'],
    env: {
      ...(process.env as Record<string, string>),
      PATHFINDER_ENV: production ? 'production' : 'sandbox',
    },
    stderr: 'ignore',
  }),
);

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<{ error?: Body; body: Body }> {
  const r = await client.callTool({ name, arguments: { ...args, rationale: 'trace smoke' } });
  const body = JSON.parse((r.content as { text: string }[])[0]!.text) as Body;
  return r.isError ? { error: body.error as Body, body } : { body };
}

async function must(name: string, args: Record<string, unknown>): Promise<Body> {
  const r = await call(name, args);
  if (r.error) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
  return r.body;
}

/** Fill every field the persona has a value for, tick required consents, then press `submit`. */
async function fillAndSubmit(runId: string, page: Body, submit: string): Promise<Body> {
  // Every step can change the page, so each action id is taken from the latest result.
  const current = (role: string, name: string): Body | undefined =>
    (page.actions as Body[]).find((a) => a.role === role && a.accessible_name === name);
  const fields = (page.actions as Body[])
    .filter((a) => a.suggested_value !== undefined && a.allowed)
    .map(
      (a) => [a.role as string, a.accessible_name as string, a.suggested_value as string] as const,
    );
  for (const [role, name, value] of fields) {
    const a = current(role, name);
    if (a)
      page = await must('act', {
        run_id: runId,
        action_id: a.action_id,
        value,
        intent: `Enter ${name}`,
      });
  }
  const consents = (page.actions as Body[])
    .filter((a) => a.role === 'checkbox' && /^(Zgoda|Oświadczam)/.test(a.accessible_name ?? ''))
    .map((a) => a.accessible_name as string);
  for (const name of consents) {
    const a = current('checkbox', name);
    if (a)
      page = await must('act', { run_id: runId, action_id: a.action_id, intent: `Accept ${name}` });
  }
  const button = current('button', submit);
  if (!button) throw new Error(`no button "${submit}" on ${page.route_template}`);
  return must('act', { run_id: runId, action_id: button.action_id, intent: `Press ${submit}` });
}

interface Trace {
  portal: string;
  process: { name: string; goal: string };
  followup?: string;
  start: string;
  /** Buttons to press in order, one form per page. */
  submits: string[];
  goal: string;
  /** Production: the action expected to stop the trace. */
  boundary?: string;
}

const SANDBOX: Trace[] = [
  {
    portal: 'reference-insurer',
    process: { name: 'Oblicz składkę OC/AC', goal: 'See the yearly OC/AC premium for a car' },
    followup: 'FUP-001',
    start: '/kalkulator/pojazd',
    submits: ['Dalej', 'Dalej', 'Oblicz składkę'],
    goal: '/kalkulator/wynik',
  },
  {
    portal: 'reference-insurer',
    process: { name: 'Oblicz składkę podróżną', goal: 'See the travel insurance premium' },
    followup: 'FUP-002',
    start: '/ubezpieczenia/podroze',
    submits: ['Oblicz składkę podróżną'],
    goal: '/ubezpieczenia/podroze/wynik',
  },
  {
    portal: 'reference-insurer',
    process: { name: 'Porównaj', goal: 'Compare two products side by side' },
    followup: 'FUP-003',
    start: '/porownanie',
    submits: ['Porównaj'],
    goal: '/porownanie/wynik',
  },
];
const PRODUCTION: Trace[] = [
  {
    portal: 'reference-insurer-readonly',
    process: { name: 'Kup polisę OC', goal: 'Buy the calculated OC policy' },
    start: '/kalkulator/pojazd',
    submits: ['Dalej', 'Dalej', 'Oblicz składkę'],
    goal: '/kalkulator/wynik',
    boundary: 'Kup polisę',
  },
];

let failed = false;
for (const t of production ? PRODUCTION : SANDBOX) {
  const label = `${t.portal} "${t.process.name}"`;
  try {
    const start = await call('start_run', {
      portal_id: t.portal,
      persona_id: 'guest',
      mode: 'trace',
      process: t.process,
      ...(withFollowups && t.followup ? { followup_key: t.followup } : {}),
    });
    if (start.error) throw new Error(`start_run: ${JSON.stringify(start.error)}`);
    const runId = start.body.run_id as string;
    let page = await must('navigate', {
      run_id: runId,
      url: ORIGIN + t.start,
      intent: `Open ${t.start}`,
    });
    for (const s of t.submits) page = await fillAndSubmit(runId, page, s);
    if (page.route_template !== t.goal)
      throw new Error(`ended on ${page.route_template}, expected ${t.goal}`);
    if (t.boundary) {
      const buy = (page.actions as Body[]).find((a) => a.accessible_name === t.boundary);
      const r = await call('act', {
        run_id: runId,
        action_id: buy?.action_id,
        intent: `Press ${t.boundary}`,
      });
      if (r.error?.code !== 'TRACE_BOUNDARY_REACHED')
        throw new Error(
          `expected TRACE_BOUNDARY_REACHED, got ${JSON.stringify(r.error ?? r.body)}`,
        );
      console.log(
        `ok   ${label}: boundary at "${t.boundary}" after ${r.error.steps} steps (run ${runId})`,
      );
      continue;
    }
    await must('finish_run', {
      run_id: runId,
      outcome: 'goal_reached',
      observed_result: `The page ${t.goal} was shown.`,
    });
    console.log(`ok   ${label}: goal reached, ${page.step?.ord ?? '?'} steps (run ${runId})`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${label}: ${(e as Error).message}`);
  }
}
await client.close();
process.exit(failed ? 1 : 0);
