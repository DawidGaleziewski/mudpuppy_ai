/**
 * Lint warning counts per rule and package, as a Markdown table (spec 012 T021, lint-baseline.md).
 * Usage: pnpm lint:report [dir ...]   (default: this app; e.g. `../chat ../../packages/workflow`)
 * Each dir is linted with its own eslint config. Never fails on findings: it is a report.
 */
import { spawnSync } from 'node:child_process';
import { basename, relative, resolve } from 'node:path';
import type { ESLint } from 'eslint';

const app = resolve(import.meta.dirname, '..');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['.'];

/** `packages/<name>` inside the crawler, otherwise the linted dir's own path. */
function packageOf(dir: string, file: string): string {
  const rel = relative(dir, file);
  const m = /^packages\/([^/]+)\//.exec(rel);
  if (m) return m[1]!;
  return dir === app ? (rel.split('/')[0] ?? rel) : basename(dir);
}

/** One process per dir: typed lint keeps one project service per process (two collide). */
function lint(dir: string): ESLint.LintResult[] {
  const run = spawnSync('pnpm', ['exec', 'eslint', '.', '--format', 'json'], {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const json = run.stdout.slice(run.stdout.indexOf('['));
  return JSON.parse(json) as ESLint.LintResult[];
}

const counts = new Map<string, Map<string, number>>();
let errors = 0;
for (const d of dirs) {
  const dir = resolve(app, d);
  for (const r of lint(dir)) {
    for (const m of r.messages) {
      if (m.severity === 2) errors++;
      const rule = `${m.severity === 2 ? 'error' : 'warn'} ${m.ruleId ?? 'parse'}`;
      const pkg = packageOf(dir, r.filePath);
      const byPkg = counts.get(rule) ?? new Map<string, number>();
      byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + 1);
      counts.set(rule, byPkg);
    }
  }
}

console.log('| Rule | Total | Per package |');
console.log('| --- | --- | --- |');
for (const [rule, byPkg] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  const total = [...byPkg.values()].reduce((a, b) => a + b, 0);
  const per = [...byPkg]
    .sort(([, a], [, b]) => b - a)
    .map(([p, n]) => `${p} ${n}`)
    .join(', ');
  console.log(`| \`${rule}\` | ${total} | ${per} |`);
}
console.log(`\n${errors} errors.`);
