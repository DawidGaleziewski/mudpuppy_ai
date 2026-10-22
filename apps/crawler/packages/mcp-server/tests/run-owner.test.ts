// F-14 (spec 010, T040): several mudpuppy servers share one store. A server start or shutdown may only
// interrupt runs whose server is gone (start) or that it drives itself (shutdown).

import { describe, expect, it } from 'vitest';
import { interruptStaleRuns, processAlive } from '../src/index.js';
import type { ServerContext } from '../src/context.js';
import { makeCtx, seedRun } from './helpers.js';

async function owned(
  ctx: ServerContext,
  owner: { id: string; pid: number } | null,
): Promise<string> {
  const id = await seedRun(ctx);
  await ctx.db
    .updateTable('runs')
    .set({ owner_id: owner?.id ?? null, owner_pid: owner?.pid ?? null })
    .where('id', '=', id)
    .execute();
  return id;
}

async function status(ctx: ServerContext, id: string): Promise<string> {
  return (
    await ctx.db.selectFrom('runs').select('status').where('id', '=', id).executeTakeFirstOrThrow()
  ).status;
}

describe('run ownership (F-14)', () => {
  const shell = { id: 'server-shell', pid: 1001 };
  const chat = { id: 'server-chat', pid: 1002 };
  const alive = (pid: number): boolean => pid === shell.pid || pid === chat.pid;

  it('a second server starting leaves the first server’s running run alone', async () => {
    const base = await makeCtx();
    const shellRun = await owned(base, shell);
    const second: ServerContext = { ...base, owner: chat };
    expect(await interruptStaleRuns(second, 'startup', alive)).toEqual([]);
    expect(await status(base, shellRun)).toBe('running');
  });

  it('on start, interrupts runs whose server is gone and runs from before 0009', async () => {
    const base = await makeCtx();
    const gone = await owned(base, { id: 'server-old', pid: 999 });
    const legacy = await owned(base, null);
    const live = await owned(base, shell);
    const starting: ServerContext = { ...base, owner: chat };
    expect((await interruptStaleRuns(starting, 'startup', alive)).sort()).toEqual(
      [gone, legacy].sort(),
    );
    expect(await status(base, live)).toBe('running');
  });

  it('a run recorded under this pid by an earlier instance counts as gone', async () => {
    const base = await makeCtx();
    const earlier = await owned(base, { id: 'server-before-restart', pid: chat.pid });
    const starting: ServerContext = { ...base, owner: chat };
    expect(await interruptStaleRuns(starting, 'startup', alive)).toEqual([earlier]);
  });

  it('on shutdown, interrupts only its own runs', async () => {
    const base = await makeCtx();
    const shellRun = await owned(base, shell);
    const chatRun = await owned(base, chat);
    const stopping: ServerContext = { ...base, owner: chat };
    expect(await interruptStaleRuns(stopping, 'shutdown', alive)).toEqual([chatRun]);
    expect(await status(base, shellRun)).toBe('running');
    expect(await status(base, chatRun)).toBe('interrupted');
  });

  it('without an owner every running run is the server’s own (single-server behaviour)', async () => {
    const base = await makeCtx();
    const a = await owned(base, shell);
    const b = await owned(base, null);
    expect((await interruptStaleRuns(base, 'startup', alive)).sort()).toEqual([a, b].sort());
  });

  it('processAlive sees this process and not a pid that cannot exist', () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(2 ** 22 + 12345)).toBe(false);
  });
});
