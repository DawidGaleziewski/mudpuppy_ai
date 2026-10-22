/**
 * The Workbench evals (spec 043 T020, D-8):
 *
 *   pnpm --dir apps/chat eval:workbench --replay <outcomes.json>
 *   pnpm --dir apps/chat eval:workbench --live [--budget-usd 0.3] [--model <m>] [--only chat-01,map-05]
 *
 * `--replay` grades recorded outcomes (no model, what the tests do). `--live` runs each golden
 * prompt once as a headless `claude -p` session with the Workbench prompt and only its two tools,
 * on a fresh seeded workspace, reads what it left in the store and grades it. A live run costs
 * money (about 40 sessions); it runs only when the owner asks. Results go to
 * data/evals/workbench-<portal>/.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { openDb } from '@mudpuppy/store';
import { readAgentFile } from '../../src/session-config.js';
import { turnContext } from '../../src/workbench-context.js';
import { workbenchFile, WORKBENCH_TOOLS } from '../../src/workbench-session.js';
import { loadGolden, type GoldenTask } from './golden.js';
import { gradeSuite, type TrialOutcome } from './grade.js';
import { seedWorkspace, type TaskWorkspace } from './seed.js';

const ROOT = resolve(import.meta.dirname, '../../../..');
const PORTAL = 'reference-insurer';
const OFF = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Agent',
  'Task',
];

/** What the task's turn left in the workspace store. */
export function outcomeOf(id: string, ws: TaskWorkspace): TrialOutcome {
  const { raw } = openDb(ws.storePath);
  try {
    const view = raw
      .prepare(
        `SELECT spec_json, dropped_json FROM workbench_views WHERE conversation_id = ? AND turn = 1`,
      )
      .get(ws.conversationId) as { spec_json: string; dropped_json: string } | undefined;
    const commands = (
      raw
        .prepare(`SELECT command FROM workbench_commands WHERE conversation_id = ?`)
        .all(ws.conversationId) as {
        command: string;
      }[]
    ).map((c) => c.command);
    if (view === undefined) return { id, view: null, commands };
    const spec = JSON.parse(view.spec_json) as { path: string; components: { type: string }[] };
    const dropped = (JSON.parse(view.dropped_json) as unknown[]).length;
    return {
      id,
      view: { path: spec.path, types: spec.components.map((c) => c.type), dropped },
      commands,
    };
  } finally {
    raw.close();
  }
}

function runTask(task: GoldenTask, opts: { budget: string; model?: string }): TrialOutcome {
  const ws = seedWorkspace(ROOT, PORTAL, task.page_text);
  try {
    const { raw } = openDb(ws.storePath);
    const context = turnContext(raw, {
      conversationId: ws.conversationId,
      portal: PORTAL,
      phase: 1,
      chips: [],
    });
    raw.close();
    const args = [
      ...[
        '-p',
        `${context}\n\n${task.prompt}`,
        '--system-prompt',
        readAgentFile(workbenchFile(ROOT)).body,
      ],
      ...['--output-format', 'json', '--max-budget-usd', opts.budget],
      ...['--mcp-config', join(ws.dir, '.mcp.json'), '--strict-mcp-config'],
      ...['--allowedTools', WORKBENCH_TOOLS.join(','), '--disallowedTools', OFF.join(',')],
      ...(opts.model ? ['--model', opts.model] : []),
    ];
    spawnSync('claude', args, { cwd: ws.dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return outcomeOf(task.id, ws);
  } finally {
    ws.remove();
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      replay: { type: 'string' },
      live: { type: 'boolean', default: false },
      'budget-usd': { type: 'string', default: '0.3' },
      model: { type: 'string' },
      only: { type: 'string' },
    },
  });
  const only = values.only?.split(',');
  const tasks = loadGolden().filter((t) => only === undefined || only.includes(t.id));
  let outcomes: TrialOutcome[];
  if (values.replay !== undefined)
    outcomes = JSON.parse(readFileSync(values.replay, 'utf8')) as TrialOutcome[];
  else if (values.live) {
    const opts = { budget: values['budget-usd'], ...(values.model ? { model: values.model } : {}) };
    outcomes = tasks.map((t) => runTask(t, opts));
  } else {
    console.error(
      'usage: eval:workbench --replay <outcomes.json> | --live [--budget-usd 0.3] [--model m] [--only ids]',
    );
    process.exit(2);
  }
  const grade = gradeSuite(tasks, outcomes);
  const dir = join(ROOT, 'data', 'evals', `workbench-${PORTAL}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `trial-${new Date().toISOString().replaceAll(':', '-')}.json`);
  writeFileSync(file, `${JSON.stringify({ outcomes, grade }, null, 2)}\n`);
  console.log(
    `path ${(100 * grade.path_accuracy).toFixed(1)} % · recall ${(100 * grade.recall).toFixed(1)} % · ` +
      `precision ${(100 * grade.precision).toFixed(1)} % · invalid ${(100 * grade.invalid_rate).toFixed(1)} % · ` +
      `injection commands ${String(grade.injection_commands)} → ${grade.passed ? 'PASS' : `FAIL: ${grade.failures.join('; ')}`}`,
  );
  console.log(file);
  process.exit(grade.passed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
