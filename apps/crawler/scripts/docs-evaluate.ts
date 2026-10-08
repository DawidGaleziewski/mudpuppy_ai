/**
 * Score a portal's documentation against a ground truth (specs/004 contracts/ground-truth.md;
 * FR-063, FR-064, SC-008, SC-009).
 * Usage: pnpm docs:evaluate <portal> --ground-truth <file> [--env production] [--min <category>=<pct>]…
 *        [--out <file.json>] [--root <repo root>]
 * Categories: screens, fields, constraints, rules, processes, terms; `--min overclaims=<n>` is the
 * most over-claims allowed. Defaults: the SC-008 targets and 0 over-claims. Prints the JSON report,
 * or writes it to --out with a Markdown summary next to it (same name, .md).
 * Exit 0 when every threshold passes, 1 when any fails, 2 on bad input.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CATEGORIES,
  DEFAULT_THRESHOLDS,
  GroundTruth,
  evaluate,
  evaluationMarkdown,
  loadEvalInput,
  reportJson,
  type Thresholds,
} from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
};
const portal = process.argv[2] ?? ''; // '' fails the check below like a missing argument
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal))
  fail(
    'usage: pnpm docs:evaluate <portal> --ground-truth <file> [--env <env>] [--min <category>=<pct>]… [--out <file>]',
  );

const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
process.argv.forEach((a, i) => {
  if (a !== '--min') return;
  const m = /^([a-z]+)=(\d+(?:\.\d+)?)$/.exec(process.argv[i + 1] ?? '');
  const key = m?.[1];
  if (!m || !key || !(key === 'overclaims' || (CATEGORIES as readonly string[]).includes(key)))
    fail(`bad --min ${process.argv[i + 1] ?? ''}: use <category>=<pct> or overclaims=<n>`);
  thresholds[key as keyof Thresholds] = Number(m![2]);
});

const gtPath = arg('ground-truth') ?? fail('--ground-truth <file> is required');
let groundTruth: GroundTruth;
try {
  groundTruth = GroundTruth.parse(JSON.parse(readFileSync(resolve(gtPath), 'utf8')));
} catch (e) {
  fail(`cannot read the ground truth ${gtPath}: ${e instanceof Error ? e.message : String(e)}`);
}
if (groundTruth!.portal_id !== portal)
  fail(`the ground truth is for portal ${groundTruth!.portal_id}, not ${portal}`);

const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const env = arg('env') ?? 'production';
const path = dbPathFor(join(root, 'data'), env);
if (!existsSync(path)) fail(`no store for environment ${env}: ${path}`);

const opened = openDb(path);
try {
  opened.raw.pragma('query_only = ON');
  const input = loadEvalInput(opened.raw, portal);
  const report = evaluate({ portal_id: portal, ...input, groundTruth: groundTruth!, thresholds });
  const json = reportJson(report);
  const out = arg('out');
  if (out) {
    const target = resolve(out);
    writeFileSync(target, json);
    writeFileSync(target.replace(/\.json$/, '') + '.md', evaluationMarkdown(report, groundTruth!));
    console.log(`${report.passed ? 'passed' : `failed: ${report.failed.join(', ')}`} → ${target}`);
  } else process.stdout.write(json);
  if (!report.passed) process.exitCode = 1;
} finally {
  await opened.close();
}
