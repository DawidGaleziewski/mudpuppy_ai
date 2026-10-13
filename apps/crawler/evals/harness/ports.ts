/**
 * Who listens on a TCP port (spec 009 F-16, spec 020 T005). An eval must measure the build it
 * started, so a server it did not start is refused, and its own servers must leave their ports free.
 */
import { spawnSync } from 'node:child_process';

/** The listener on `port` as `ss` shows it (`"node",pid=123`), or null when the port is free. */
export function portHolder(port: number): string | null {
  const r = spawnSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' });
  if (r.error) throw new Error(`cannot check port ${port}: ${r.error.message}`);
  const line = r.stdout.split('\n').find((l) => l.trim() !== '');
  if (!line) return null;
  // The process part is shown only for our own processes; another user's listener still counts.
  return /users:\(\((.*)\)\)/.exec(line)?.[1] ?? 'a process of another user';
}

/** Ports in `ports` that something listens on, with their holders. */
export function heldPorts(ports: readonly number[]): { port: number; holder: string }[] {
  return ports.flatMap((port) => {
    const holder = portHolder(port);
    return holder ? [{ port, holder }] : [];
  });
}

/** Wait until every port is free, polling; returns the ones still held after `timeoutMs`. */
export async function waitPortsFree(
  ports: readonly number[],
  timeoutMs: number,
): Promise<{ port: number; holder: string }[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const held = heldPorts(ports);
    if (held.length === 0 || Date.now() >= until) return held;
    await new Promise((r) => setTimeout(r, 100));
  }
}
