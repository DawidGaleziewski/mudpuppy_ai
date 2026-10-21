// Check runs (spec 039 owner answers 12 and 19, 2026-10-21): the probe work of the portal model runs
// on the headless driver (no LLM) as `pnpm model:replay` or `pnpm model:explore`. The owner starts
// one with a button in the dashboard, or by saying yes in the chat; the service runs the command in
// the background, one check run per portal at a time, its output in a log file.

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newId, nowIso } from '@pathfinder/core';
import { z } from 'zod';
import { HttpError } from './http-error.js';

/** `replay`: error replays, boundary and regression tests; `explore`: the stopping rule per process. */
export const CheckRunKind = z.enum(['replay', 'explore']);
export type CheckRunKind = z.infer<typeof CheckRunKind>;

export const CheckRunBody = z
  .object({
    kind: CheckRunKind,
    /** `explore` only: the process to explore (`PRC-…`); without it every unexplored one. */
    process_key: z
      .string()
      .regex(/^PRC-\d{3,}$/)
      .optional(),
    /** Who started it (the dashboard's reviewer, or `assistant` after the owner's yes). */
    author: z.string().trim().min(1).max(200),
  })
  .strict();
export type CheckRunBody = z.infer<typeof CheckRunBody>;

export interface StartedCheckRun {
  id: string;
  portal: string;
  kind: CheckRunKind;
  process_key: string | null;
  author: string;
  pid: number;
  log: string;
  command: string[];
  started_at: string;
}

type Spawn = (
  command: string,
  args: string[],
  options: { cwd: string; detached: boolean; stdio: ['ignore', number, number]; env: NodeJS.ProcessEnv },
) => { pid?: number | undefined; unref(): void };

export interface CheckRunDeps {
  repoRoot: string;
  environment: string;
  /** Replaced in tests; the real one starts `pnpm`. */
  spawn?: Spawn;
  /** Whether a process still runs (replaced in tests). */
  alive?: (pid: number) => boolean;
}

const aliveProcess = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Where a portal's running check run is noted (one per portal and environment). */
const lockOf = (deps: CheckRunDeps, portal: string) =>
  join(deps.repoRoot, 'data', 'check-runs', deps.environment, `${portal}.json`);

/** The check run still running for the portal, if any. */
export function runningCheckRun(deps: CheckRunDeps, portal: string): StartedCheckRun | null {
  const lock = lockOf(deps, portal);
  if (!existsSync(lock)) return null;
  const run = JSON.parse(readFileSync(lock, 'utf8')) as StartedCheckRun;
  return (deps.alive ?? aliveProcess)(run.pid) ? run : null;
}

/**
 * Start a check run in the background. Refused when the portal is unknown, when a check run of the
 * portal still runs, or for a process key with `replay` (replays take the whole portal).
 */
export function startCheckRun(deps: CheckRunDeps, portal: string, raw: unknown): StartedCheckRun {
  const body = CheckRunBody.safeParse(raw);
  if (!body.success)
    throw new HttpError(400, body.error.issues.map((i) => i.message).join('; '));
  const { kind, process_key: key, author } = body.data;
  if (key !== undefined && kind !== 'explore')
    throw new HttpError(400, 'Only an exploration takes a process; replays take the whole portal.');
  if (!existsSync(join(deps.repoRoot, 'portals', portal, 'portal.yaml')))
    throw new HttpError(404, `There is no portal ${portal}.`);
  const running = runningCheckRun(deps, portal);
  if (running !== null)
    throw new HttpError(
      409,
      `A check run of ${portal} is still running (${running.kind}, started ${running.started_at}).`,
      { code: 'CHECK_RUN_BUSY', running },
    );
  const id = newId();
  const dir = join(deps.repoRoot, 'data', 'check-runs', deps.environment);
  mkdirSync(dir, { recursive: true });
  const log = join(dir, `${id}.log`);
  const fd = openSync(log, 'a');
  const args = [
    '--dir',
    'apps/crawler',
    `model:${kind}`,
    portal,
    ...(key === undefined ? [] : [key]),
    '--env',
    deps.environment,
  ];
  const child = (deps.spawn ?? nodeSpawn)('pnpm', args, {
    cwd: deps.repoRoot,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, PATHFINDER_ENV: deps.environment },
  });
  if (child.pid === undefined) throw new HttpError(500, 'The check run did not start.');
  child.unref();
  const started: StartedCheckRun = {
    id,
    portal,
    kind,
    process_key: key ?? null,
    author,
    pid: child.pid,
    log,
    command: ['pnpm', ...args],
    started_at: nowIso(),
  };
  writeFileSync(lockOf(deps, portal), JSON.stringify(started, null, 2));
  return started;
}
