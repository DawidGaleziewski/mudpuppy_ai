/**
 * Start and stop the portal's local server for an eval (spec 009 R-27; spec 014 D5, D8).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { EvalTask } from '../tasks.js';

/** Readiness probe: is the server answering yet? Not a check of the portal itself. */
export async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

export type EnsureResult = { ok: true; server: ChildProcess | null } | { ok: false; error: string };

/**
 * Start the portal's local server when it is not up; `server` is the process to stop afterwards.
 * With a session timeout the estate must be started here: one already running has an unknown
 * timeout, so the result would not be comparable (D5). A live site (no `server`) has nothing to start.
 */
export async function ensurePortal(
  root: string,
  task: EvalTask,
  sessionTimeoutS?: number,
): Promise<EnsureResult> {
  if (sessionTimeoutS !== undefined && !task.server?.takesSessionTimeout)
    return { ok: false, error: '--session-timeout applies to proving-ground portals only' };
  if (!task.server) return { ok: true, server: null };
  const { probe, command, args } = task.server;
  if (await healthy(probe)) {
    if (sessionTimeoutS !== undefined)
      return {
        ok: false,
        error: `--session-timeout: the estate is already running at ${probe} with an unknown timeout; stop it first`,
      };
    return { ok: true, server: null };
  }
  const child = spawn(command, args(root, sessionTimeoutS), { stdio: 'ignore', detached: true });
  for (let i = 0; i < 300; i++) {
    if (await healthy(probe)) return { ok: true, server: child };
    await new Promise((r) => setTimeout(r, 300));
  }
  stopServer(child);
  return { ok: false, error: `the portal did not come up at ${probe}` };
}

/**
 * Stop the whole process group: the pnpm/node wrapper does not always pass a signal on to its
 * child, which then keeps the port (spec 009 F-16).
 */
export function stopServer(server: ChildProcess | null): void {
  if (!server?.pid) return;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    try {
      process.kill(-server.pid, sig);
    } catch {
      return; // the group is gone
    }
  }
}
