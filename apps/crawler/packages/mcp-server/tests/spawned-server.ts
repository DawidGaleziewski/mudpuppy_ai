import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The real `pathfinder` server as the chat starts it: `node --import tsx src/main.ts` over stdio,
 * on a throwaway root (spec 010 F-19 shutdown, spec 031 T005 hooks under tsx). Only what a
 * spawned server shows differently from the in-process one belongs in these tests.
 */

const PKG = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

/** A throwaway root with the migrations and the given files (path relative to the root). */
export function throwawayRoot(prefix: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cpSync(MIGRATIONS, join(root, 'data', 'migrations'), { recursive: true });
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), c);
  }
  return root;
}

/** Live descendants of a process (Linux /proc), so Chromium can be seen going away. */
export function descendants(pid: number): number[] {
  const parent = new Map<number, number>();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      parent.set(Number(name), ppid);
    } catch {
      // gone meanwhile
    }
  }
  const out: number[] = [];
  const walk = (p: number) => {
    for (const [child, pp] of parent) {
      if (pp !== p) continue;
      out.push(child);
      walk(child);
    }
  };
  walk(pid);
  return out;
}

export interface SpawnedServer {
  child: ChildProcessWithoutNullStreams;
  pid: number;
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** SIGKILL the server and everything it started (a failing test leaves nothing behind). */
  kill(): void;
}

/** Start the server on `root` and finish the MCP handshake. */
export async function spawnServer(root: string, environment = 'sandbox'): Promise<SpawnedServer> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: PKG,
    env: { ...process.env, PATHFINDER_ROOT: root, PATHFINDER_ENV: environment },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error('the pathfinder server did not start');
  child.stderr.resume();
  const pending = new Map<number, (v: Record<string, unknown>) => void>();
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d: string) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const msg = JSON.parse(line) as { id?: number; result?: Record<string, unknown> };
      if (msg.id !== undefined) pending.get(msg.id)?.(msg.result ?? {});
    }
  });
  let seq = 0;
  const rpc = (method: string, params: unknown) =>
    new Promise<Record<string, unknown>>((resolve) => {
      seq += 1;
      pending.set(seq, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: seq, method, params })}\n`);
    });
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return {
    child,
    pid,
    tool: async (name, args) =>
      (await rpc('tools/call', { name, arguments: args })).structuredContent as Record<
        string,
        unknown
      >,
    kill: () => {
      for (const p of [...descendants(pid), pid])
        try {
          process.kill(p, 'SIGKILL');
        } catch {
          // already gone
        }
    },
  };
}
