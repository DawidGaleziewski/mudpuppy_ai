/**
 * Mutation testing on demand (spec 012 US6, guideline G-32): Stryker per package, one after the
 * other, then a summary table. Never part of the commit hook or `pnpm test`.
 * Usage: pnpm mutate [--package <name>]   (default: the kernel packages of layers.json + safety + config)
 * Reports: data/mutation/stryker/<package>/report.html|json (gitignored).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const app = resolve(import.meta.dirname, '..');
const repo = resolve(app, '../..');

interface Layers {
  layers: { name: string; packages: string[] }[];
}

function defaultPackages(): string[] {
  const layers = JSON.parse(readFileSync(join(app, 'layers.json'), 'utf8')) as Layers;
  const kernel = layers.layers.find((l) => l.name === 'kernel')?.packages ?? [];
  // `obstacles` needs a browser for every test: too slow to mutate on demand.
  return [...kernel.filter((p) => p !== 'obstacles'), 'safety', 'config'];
}

const i = process.argv.indexOf('--package');
const packages = i > -1 && process.argv[i + 1] ? [process.argv[i + 1]!] : defaultPackages();

interface Report {
  files: Record<string, { mutants: { status: string }[] }>;
}

/** Untracked files in the repo: mutants run in place and may write stray files (findings F-11). */
const untracked = (): Set<string> =>
  new Set(
    spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: repo,
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .filter(Boolean),
  );
const before = untracked();

const rows: string[] = [];
let failed = false;
for (const pkg of packages) {
  console.log(`\n── mutate ${pkg} ──`);
  const run = spawnSync('pnpm', ['exec', 'stryker', 'run'], {
    cwd: app,
    stdio: 'inherit',
    env: { ...process.env, MUDPUPPY_MUTATE_PACKAGE: pkg },
  });
  const file = join(repo, 'data/mutation/stryker', pkg, 'report.json');
  if (run.status !== 0 || !existsSync(file)) {
    failed = true;
    rows.push(`| ${pkg} | failed (exit ${run.status}) | | | | | |`);
    continue;
  }
  const report = JSON.parse(readFileSync(file, 'utf8')) as Report;
  const count = (s: string) =>
    Object.values(report.files).reduce(
      (n, f) => n + f.mutants.filter((m) => m.status === s).length,
      0,
    );
  const killed = count('Killed');
  const timeout = count('Timeout');
  const survived = count('Survived');
  const noCov = count('NoCoverage');
  const total = Object.values(report.files).reduce((n, f) => n + f.mutants.length, 0);
  const valid = killed + timeout + survived + noCov;
  const score = valid ? (((killed + timeout) / valid) * 100).toFixed(1) : '–';
  rows.push(`| ${pkg} | ${total} | ${killed} | ${survived} | ${noCov} | ${timeout} | ${score} % |`);
}
console.log('\n| Package | Mutants | Killed | Survived | No coverage | Timeout | Score |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(r);
const stray = [...untracked()].filter((f) => !before.has(f));
if (stray.length > 0)
  console.log(`\nFiles a mutant left behind (check, then delete):\n${stray.join('\n')}`);
process.exitCode = failed ? 1 : 0;
