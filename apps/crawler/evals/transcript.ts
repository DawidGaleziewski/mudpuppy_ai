/**
 * `pnpm eval:transcript [<result.json> | <portal>]` (spec 034 F-21): what each agent session of a
 * trial did, from its Claude Code transcript: tool calls, records written per kind, refusals,
 * the passes with the records written before each and their warnings, the largest context.
 * A portal name reads its latest result. No model call.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from './config.js';
import { die } from './failures.js';
import { summariseTranscript } from './transcript-summary.js';

const USAGE = 'usage: pnpm eval:transcript <result.json> | <portal>';

function resultPath(arg: string | undefined): string {
  if (!arg) return die(USAGE);
  if (arg.endsWith('.json')) return resolve(arg);
  const dir = join(REPO_ROOT, 'data', 'evals', arg);
  const latest = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^\d{4}-.*\.json$/.test(f))
        .sort()
        .at(-1)
    : undefined;
  return latest ? join(dir, latest) : die(`no results for ${arg} in ${dir}`);
}

/** The CLI sessions a result names, by role. */
function sessionsOf(result: { runs?: Record<string, unknown> }): [string, string][] {
  const r = result.runs ?? {};
  const out: [string, string][] = [];
  for (const [role, key] of [
    ['crawler', 'crawler_cli_session'],
    ['ba (map)', 'ba_cli_session'],
    ['ba (traces)', 'ba_traces_cli_session'],
  ] as const)
    if (typeof r[key] === 'string') out.push([role, r[key]]);
  // Trials before spec 039 T116 call it `probe_scan`.
  const probing = (r.form_probing ?? r.probe_scan) as { cli_session?: string } | null | undefined;
  if (probing?.cli_session) out.push(['form probing', probing.cli_session]);
  return out;
}

// Claude Code keeps a project's transcripts under its path with every `/` and `.` as `-`.
const transcripts = join(homedir(), '.claude', 'projects', REPO_ROOT.replace(/[/.]/g, '-'));

const path = resultPath(process.argv[2]);
const result = JSON.parse(readFileSync(path, 'utf8')) as { runs?: Record<string, unknown> };
console.log(`result: ${path}`);
for (const [role, id] of sessionsOf(result)) {
  const file = join(transcripts, `${id}.jsonl`);
  if (!existsSync(file)) {
    console.log(`\n## ${role} (${id}): no transcript at ${file}`);
    continue;
  }
  const s = summariseTranscript(readFileSync(file, 'utf8').split('\n'));
  console.log(`\n## ${role} (${id})`);
  console.log(`turns ${String(s.turns)}, largest context ${String(s.max_context_tokens)} tokens`);
  console.log(`calls: ${JSON.stringify(s.calls)}`);
  if (Object.keys(s.written).length > 0) console.log(`written: ${JSON.stringify(s.written)}`);
  for (const p of s.passes)
    console.log(
      `pass ${p.pass} after ${String(p.records_before)} records${p.warnings.length ? `; warnings: ${p.warnings.join(' | ').slice(0, 300)}` : ''}`,
    );
  for (const r of s.refused) console.log(`refused ${r.tool} ${r.code}: ${r.message}`);
}
