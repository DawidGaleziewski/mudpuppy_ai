/**
 * Start and stop the portal's local server for an eval (spec 009 R-27; spec 014 D5, D8).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { EvalTask } from '../tasks.js';
import { heldPorts, waitPortsFree } from './ports.js';

/** Readiness probe: is the server answering yet? Not a check of the portal itself. */
export async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** The portal's server and the ports it holds while it runs. */
export interface StartedServer {
  child: ChildProcess;
  ports: readonly number[];
}

export type EnsureResult =
  { ok: true; server: StartedServer | null } | { ok: false; error: string };

/**
 * Start the portal's local server; `server` is what to stop afterwards. A server already listening
 * on one of its ports was not started by this eval, so it is refused: its build and settings (such
 * as a session timeout) are unknown and the result would not measure this checkout (spec 009 F-16).
 * A live site (no `server`) has nothing to start.
 */
export async function ensurePortal(
  root: string,
  task: EvalTask,
  sessionTimeoutS?: number,
): Promise<EnsureResult> {
  if (sessionTimeoutS !== undefined && !task.server?.takesSessionTimeout)
    return { ok: false, error: '--session-timeout applies to proving-ground portals only' };
  if (!task.server) return { ok: true, server: null };
  const { probe, command, args, ports } = task.server;
  const held = heldPorts(ports);
  if (held.length > 0)
    return {
      ok: false,
      error: `the eval starts its own portal server, but ${held
        .map((h) => `port ${h.port} is held by ${h.holder}`)
        .join(', ')}; stop it first`,
    };
  const child = spawn(command, args(root, sessionTimeoutS), { stdio: 'ignore', detached: true });
  const server = { child, ports };
  for (let i = 0; i < 300; i++) {
    if (await healthy(probe)) return { ok: true, server };
    await new Promise((r) => setTimeout(r, 300));
  }
  await stopServer(server);
  return { ok: false, error: `the portal did not come up at ${probe}` };
}

/** How long a stopped server may take to free its ports before its group is killed. */
const GRACE_MS = 5000;

/**
 * Stop the whole process group: the pnpm/node wrapper does not always pass a signal on to its
 * child, which then keeps the port (spec 009 F-16). Waits until the ports are free, kills the group
 * after `GRACE_MS`, and returns the ports still held (empty when all is clean).
 */
export async function stopServer(server: StartedServer | null): Promise<string[]> {
  if (!server?.child.pid) return [];
  const pid = server.child.pid;
  if (!signalGroup(pid, 'SIGTERM')) return [];
  let held = await waitPortsFree(server.ports, GRACE_MS);
  if (held.length > 0) {
    signalGroup(pid, 'SIGKILL');
    held = await waitPortsFree(server.ports, 1000);
  }
  const left = held.map((h) => `port ${h.port} still held by ${h.holder}`);
  for (const l of left) console.error(`warning: ${l}`);
  return left;
}

/** Signal a process group; false when it is already gone. */
function signalGroup(pid: number, sig: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, sig);
    return true;
  } catch {
    return false;
  }
}
