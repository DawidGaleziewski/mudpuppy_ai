/**
 * The MudPuppy 2.0 data reset (spec 039 plan § 2, T002): delete every generated data artifact of
 * v1 and move the v1 eval trials into `history/v1/`, so v2 starts from an empty store. Planning is
 * separate from applying, so the script can print a dry run; applying refuses while anything still
 * holds a store file open or a Pathfinder port answers.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { connect } from 'node:net';
import { join, relative } from 'node:path';

/** Directories whose contents are deleted (each keeps its `.gitkeep`). */
export const RESET_DIRS = [
  'db',
  'evidence',
  'traces',
  'exports',
  'gates',
  'logs',
  'mutation',
  'servers',
] as const;

const TRIAL_FILE = /^\d{4}-\d{2}-\d{2}T[\w-]+\.json$/;

export interface ResetPlan {
  dataDir: string;
  /** Paths to delete, with their size in bytes. */
  deletes: { path: string; bytes: number }[];
  /** Eval files to move: v1 trials, baselines and baseline history. */
  moves: { from: string; to: string }[];
}

/** Bytes under `path`; symlinks count as themselves, never followed (Stryker sandboxes link `node_modules`). */
function sizeOf(path: string): number {
  const s = lstatSync(path);
  if (!s.isDirectory()) return s.size;
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0);
}

function evalMoves(evalsDir: string): ResetPlan['moves'] {
  if (!existsSync(evalsDir)) return [];
  const moves: ResetPlan['moves'] = [];
  for (const portal of readdirSync(evalsDir)) {
    const dir = join(evalsDir, portal);
    if (!statSync(dir).isDirectory()) continue;
    const target = join(dir, 'history', 'v1');
    for (const name of readdirSync(dir)) {
      if (TRIAL_FILE.test(name) || name === 'baseline.json')
        moves.push({ from: join(dir, name), to: join(target, name) });
    }
    const history = join(dir, 'history');
    if (!existsSync(history)) continue;
    for (const name of readdirSync(history)) {
      if (name.endsWith('.json')) moves.push({ from: join(history, name), to: join(target, name) });
    }
  }
  return moves;
}

/** What a reset of `dataDir` (the repo's `data/`) would delete and move. Reads only. */
export function planStoreReset(dataDir: string): ResetPlan {
  const deletes: ResetPlan['deletes'] = [];
  for (const sub of RESET_DIRS) {
    const dir = join(dataDir, sub);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name === '.gitkeep') continue;
      const path = join(dir, name);
      deletes.push({ path, bytes: sizeOf(path) });
    }
  }
  return { dataDir, deletes, moves: evalMoves(join(dataDir, 'evals')) };
}

/** Processes (pid and command) that hold a file under `dir` open, read from `/proc` (Linux). */
export function openHolders(dir: string): { pid: number; cmd: string }[] {
  if (!existsSync('/proc')) return [];
  const holders: { pid: number; cmd: string }[] = [];
  for (const entry of readdirSync('/proc')) {
    const pid = Number(entry);
    if (!Number.isInteger(pid) || pid === process.pid) continue;
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue; // gone, or not ours
    }
    const holds = fds.some((fd) => {
      try {
        return readlinkSync(`/proc/${pid}/fd/${fd}`).startsWith(`${dir}/`);
      } catch {
        return false;
      }
    });
    if (!holds) continue;
    let cmd = '?';
    try {
      cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim().slice(0, 160);
    } catch {
      // gone meanwhile; keep '?'
    }
    holders.push({ pid, cmd });
  }
  return holders;
}

/** Which of `ports` accept a connection now (the caller names the services' addresses). */
export async function answeringPorts(
  ports: readonly { host: string; port: number }[],
): Promise<string[]> {
  const probe = ({ host, port }: { host: string; port: number }) =>
    new Promise<string | null>((done) => {
      const socket = connect({ host, port });
      const end = (open: boolean) => {
        socket.destroy();
        done(open ? `${host}:${port}` : null);
      };
      socket.setTimeout(300, () => end(false));
      socket.once('connect', () => end(true));
      socket.once('error', () => end(false));
    });
  const results = await Promise.all(ports.map(probe));
  return results.filter((r): r is string => r !== null);
}

export class StoreResetRefused extends Error {}

/**
 * Apply `plan`: refuse when `blockers` is not empty, else delete, move and write
 * `data/RESET-v2.md` with what was done.
 */
export function applyStoreReset(
  plan: ResetPlan,
  { blockers, gitSha, now }: { blockers: string[]; gitSha: string; now: string },
): void {
  if (blockers.length > 0)
    throw new StoreResetRefused(`reset refused, stop these first:\n  ${blockers.join('\n  ')}`);
  for (const { path } of plan.deletes) rmSync(path, { recursive: true, force: true });
  for (const { from, to } of plan.moves) {
    mkdirSync(join(to, '..'), { recursive: true });
    renameSync(from, to);
  }
  const mb = (b: number) => (b / 1_048_576).toFixed(1);
  const total = plan.deletes.reduce((s, d) => s + d.bytes, 0);
  const rel = (p: string) => relative(join(plan.dataDir, '..'), p);
  writeFileSync(
    join(plan.dataDir, 'RESET-v2.md'),
    [
      '# Data reset for MudPuppy 2.0',
      '',
      `${now} · git ${gitSha} · spec 039 (R-81) T002 · \`pnpm store:reset --confirm\``,
      '',
      `Deleted ${plan.deletes.length} paths, ${mb(total)} MB (v1 test data; owner 2026-10-18: "We can drop it"):`,
      '',
      ...plan.deletes.map((d) => `- \`${rel(d.path)}\` (${mb(d.bytes)} MB)`),
      '',
      `Moved ${plan.moves.length} v1 eval files into \`history/v1/\` (kept to compare v2 against).`,
      '',
    ].join('\n'),
  );
}
