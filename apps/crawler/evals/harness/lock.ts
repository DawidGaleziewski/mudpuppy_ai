/**
 * One eval at a time on this machine (spec 014 F-04, spec 020 T004): evals share the account's
 * usage quota with each other and with the session that starts them, and two at once cut both off.
 * The lock is a file holding the owner's pid; a lock whose pid is gone is stale and taken over.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LOCK_PATH = join(tmpdir(), 'mudpuppy-eval.lock');

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

function holder(path: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(path, 'utf8'), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export type LockResult = { ok: true; release: () => void } | { ok: false; pid: number };

/** Take the lock for `pid`, or say which live process holds it. */
export function acquireEvalLock(path = LOCK_PATH, pid = process.pid): LockResult {
  const held = holder(path);
  if (held !== null && held !== pid && alive(held)) return { ok: false, pid: held };
  writeFileSync(path, String(pid));
  return {
    ok: true,
    release: () => {
      if (holder(path) === pid) rmSync(path, { force: true });
    },
  };
}
