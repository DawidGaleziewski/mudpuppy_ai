// Check runs (spec 039 owner answers 12 and 19): one background `pnpm model:replay|explore` per
// portal, started by the dashboard's button (HTTP) or by the assistant after the owner's yes (MCP).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { migrateUp, openDb } from '@pathfinder/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runningCheckRun, startCheckRun, type CheckRunDeps } from '../src/check-runs.js';
import { HttpError } from '../src/http-error.js';
import { createChatMcpServer } from '../src/mcp-chat.js';

const repo = join(import.meta.dirname, '../../..');
let root: string;
let spawned: { command: string; args: string[]; env: string | undefined }[];
let alive: Set<number>;
let deps: CheckRunDeps;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pathfinder-check-runs-'));
  mkdirSync(join(root, 'portals', 'shop'), { recursive: true });
  writeFileSync(join(root, 'portals', 'shop', 'portal.yaml'), 'id: shop\n');
  spawned = [];
  alive = new Set();
  let pid = 100;
  deps = {
    repoRoot: root,
    environment: 'sandbox',
    spawn: (command, args, options) => {
      spawned.push({ command, args, env: options.env.PATHFINDER_ENV });
      pid += 1;
      alive.add(pid);
      return { pid, unref: () => undefined };
    },
    alive: (p) => alive.has(p),
  };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const status = (fn: () => unknown): number | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof HttpError ? e.status : -1;
  }
};

describe('startCheckRun', () => {
  it('runs the command on the portal environment, once at a time per portal', () => {
    const run = startCheckRun(deps, 'shop', { kind: 'replay', author: 'Anna' });
    expect(spawned).toEqual([
      {
        command: 'pnpm',
        args: ['--dir', 'apps/crawler', 'model:replay', 'shop', '--env', 'sandbox'],
        env: 'sandbox',
      },
    ]);
    expect(run).toMatchObject({ kind: 'replay', author: 'Anna', process_key: null });
    expect(runningCheckRun(deps, 'shop')?.id).toBe(run.id);
    // A second one waits for the first.
    expect(status(() => startCheckRun(deps, 'shop', { kind: 'explore', author: 'Anna' }))).toBe(409);
    alive.delete(run.pid); // finished
    expect(runningCheckRun(deps, 'shop')).toBeNull();
    const next = startCheckRun(deps, 'shop', { kind: 'explore', process_key: 'PRC-001', author: 'Anna' });
    expect(spawned[1]!.args).toEqual([
      '--dir', 'apps/crawler', 'model:explore', 'shop', 'PRC-001', '--env', 'sandbox',
    ]); // fmt: skip
    expect(JSON.parse(readFileSync(next.log.replace(/[^/]+\.log$/, 'shop.json'), 'utf8'))).toMatchObject({
      id: next.id,
    });
  });

  it('refuses an unknown portal, a process with replay, and an unknown kind', () => {
    expect(status(() => startCheckRun(deps, 'nope', { kind: 'replay', author: 'A' }))).toBe(404);
    const replayOne = { kind: 'replay', process_key: 'PRC-001', author: 'A' };
    expect(status(() => startCheckRun(deps, 'shop', replayOne))).toBe(400);
    expect(status(() => startCheckRun(deps, 'shop', { kind: 'crawl', author: 'A' }))).toBe(400);
    expect(spawned).toEqual([]);
  });
});

describe('start_check_run (MCP)', () => {
  it('starts with the owner named and answers busy while one runs', async () => {
    const opened = openDb(':memory:');
    migrateUp(opened.raw, join(repo, 'data', 'migrations'));
    const server = createChatMcpServer({
      raw: opened.raw,
      paths: { repoRoot: root },
      conversationId: 'conv-1',
      checkRuns: deps,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = async (args: Record<string, unknown>) => {
      const r = await client.callTool({ name: 'start_check_run', arguments: args });
      return { isError: r.isError === true, body: r.structuredContent as Record<string, unknown> };
    };
    const args = { portal: 'shop', kind: 'replay', confirmed_by: 'the owner said: yes, run it' };
    const first = await call(args);
    expect(first.isError).toBe(false);
    expect(first.body.started).toMatchObject({ kind: 'replay' });
    expect(runningCheckRun(deps, 'shop')?.author).toBe('assistant (confirmed: the owner said: yes, run it)');
    expect(await call(args)).toMatchObject({
      isError: true,
      body: { error: { code: 'CHECK_RUN_BUSY' } },
    });
    await client.close();
    await opened.close();
  });
});
