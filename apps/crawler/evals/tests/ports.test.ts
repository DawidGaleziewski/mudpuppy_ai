import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { ensurePortal, stopServer } from '../harness/portal-server.js';
import { portHolder } from '../harness/ports.js';
import type { EvalTask } from '../tasks.js';

let open: Server | null = null;
afterEach(() => {
  open?.close();
  open = null;
});

const listen = () =>
  new Promise<number>((resolve) => {
    open = createServer().listen(0, '127.0.0.1', () => {
      const addr = open!.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

const taskOn = (port: number): EvalTask => ({
  portal: 'test-portal',
  groundTruth: 'unused.yaml',
  server: {
    probe: `http://127.0.0.1:${port}/`,
    command: 'node',
    args: () => ['-e', 'setInterval(() => {}, 1000)'],
    takesSessionTimeout: false,
    ports: [port],
  },
});

it('names the process listening on a port, and null when it is free', async () => {
  const port = await listen();
  expect(portHolder(port)).toContain(`pid=${process.pid}`);
  open!.close();
  open = null;
  await new Promise((r) => setTimeout(r, 50));
  expect(portHolder(port)).toBeNull();
});

it('refuses a portal port held by a server the eval did not start (spec 009 F-16)', async () => {
  const port = await listen();
  const up = await ensurePortal('/unused', taskOn(port));
  expect(up.ok).toBe(false);
  if (!up.ok) expect(up.error).toMatch(new RegExp(`port ${port} is held by .*pid=${process.pid}`));
});

it('stops the whole group of a started server and checks its port is free', async () => {
  // A wrapper whose child holds the port, like pnpm → tsx: the group must go, not only the wrapper.
  const child = spawn(
    'node',
    [
      '-e',
      `require('child_process').spawn('node', ['-e', "require('net').createServer().listen(0, '127.0.0.1', function () { console.log(this.address().port) })"], { stdio: 'inherit' }); setInterval(() => {}, 1000)`,
    ],
    { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const port = await new Promise<number>((resolve) =>
    child.stdout.once('data', (d: Buffer) => resolve(Number(d.toString().trim()))),
  );
  expect(portHolder(port)).not.toBeNull();
  expect(await stopServer({ child, ports: [port] })).toEqual([]);
  expect(portHolder(port)).toBeNull();
});
