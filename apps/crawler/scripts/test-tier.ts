/**
 * Test tiers (spec 012 US1, contracts/test-commands.md).
 * Usage: pnpm test:fast | pnpm test:slow [extra vitest args]
 *   fast: tests affected by uncommitted changes (staged, unstaged, untracked), without the browser
 *         end-to-end files (`*.e2e.test.ts`) and the `gates` project; the whole fast tier when a
 *         `forceRerunTriggers` file changed.
 *   slow: the `*.e2e.test.ts` files and the whole gate set (slow gate cases included).
 */
import { spawn, spawnSync } from 'node:child_process';
import { matchesGlob, relative, resolve } from 'node:path';
import { forceRerunTriggers } from '../vitest.config.js';

const app = resolve(import.meta.dirname, '..');
const [tier, ...extra] = process.argv.slice(2);

const git = (args: string[]): string[] =>
  spawnSync('git', args, { cwd: app, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

/** The same set Vitest's `--changed` uses, as absolute paths. */
function changedFiles(): string[] {
  const top = git(['rev-parse', '--show-toplevel'])[0] ?? app;
  const files = [
    ...git(['diff', '--cached', '--name-only']),
    ...git(['ls-files', '--other', '--modified', '--exclude-standard', '--full-name', top]),
  ];
  return [...new Set(files.map((f) => resolve(top, f)))];
}

function vitest(args: string[], env: NodeJS.ProcessEnv = {}): number {
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', ...args, ...extra], {
    cwd: app,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return run.status ?? 1;
}

/** Like `vitest`, but concurrent: the output is held and printed in one block when it ends. */
function vitestBuffered(label: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<number>((done) => {
    const child = spawn('pnpm', ['exec', 'vitest', 'run', ...args, ...extra], {
      cwd: app,
      env: { ...process.env, ...env },
    });
    const out: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => out.push(c));
    child.on('close', (code) => {
      console.log(`\n── ${label} (exit ${code}) ──`);
      process.stdout.write(Buffer.concat(out));
      done(code ?? 1);
    });
  });
}

const FAST = ['--project=!gates', '--exclude=**/*.e2e.test.ts'];

if (tier === 'fast') {
  const trigger = changedFiles().find((f) => forceRerunTriggers.some((g) => matchesGlob(f, g)));
  if (trigger) {
    console.log(`tier: fast (full: ${relative(app, trigger)})`);
    process.exitCode = vitest(FAST);
  } else {
    console.log('tier: fast (affected)');
    process.exitCode = vitest(['--changed', ...FAST]);
  }
} else if (tier === 'slow') {
  console.log('tier: slow');
  // Two processes at once: in one Vitest run the gates (`fileParallelism: false`) only start after
  // every parallel file has finished, so the wall time was the sum of both (spec 012 T006).
  // The e2e files use ephemeral ports, the gates their fixed 4200/4201: they do not collide.
  // `.e2e.test.ts` is a positional filter on the file name (`ba-e2e.test.ts` is not e2e).
  const codes = await Promise.all([
    // Capped workers: under full CPU load the gates' timing-sensitive cases fail (findings F-03).
    vitestBuffered('e2e', ['--project=!gates', '--maxWorkers=4', '.e2e.test.ts']),
    vitestBuffered('gates', ['--project=gates'], { PATHFINDER_SLOW_GATES: '1' }),
  ]);
  process.exitCode = Math.max(...codes);
} else {
  console.error('usage: test-tier fast|slow [vitest args]');
  process.exitCode = 2;
}
