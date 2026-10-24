import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findError, isErrorRef, logError, newErrorRef, sweepErrorLogs } from '../src/error-log.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chat-errlog-'));
});
afterEach(async () => {
  await chmod(dir, 0o700).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

describe('error log', () => {
  it('makes ERR-<ULID> refs that sort by time', () => {
    const a = newErrorRef(1_700_000_000_000);
    const b = newErrorRef(1_700_000_001_000);
    expect(a).toMatch(/^ERR-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(isErrorRef(a)).toBe(true);
    expect(isErrorRef('ERR-nope')).toBe(false);
    expect(a < b).toBe(true);
    expect(newErrorRef()).not.toBe(newErrorRef());
  });

  it('writes one line and reads it back by ref', async () => {
    const now = new Date('2026-10-05T10:00:00Z');
    const r = await logError(
      {
        conversation_id: 'c1',
        step: 'scan',
        where: 'acp-client',
        message: 'boom',
        detail: { a: 1 },
      },
      { logsDir: dir, now },
    );
    expect(r.logged).toBe(true);
    const text = await readFile(join(dir, '2026-10-05.jsonl'), 'utf8');
    expect(text.trim().split('\n')).toHaveLength(1);
    const rec = await findError(r.ref, { logsDir: dir });
    expect(rec).toMatchObject({
      ref: r.ref,
      time: now.toISOString(),
      conversation_id: 'c1',
      step: 'scan',
      where: 'acp-client',
      message: 'boom',
      detail: { a: 1 },
    });
    expect(await findError('ERR-00000000000000000000000000', { logsDir: dir })).toBeNull();
  });

  it('keeps the class of an Error in the detail (F-21)', async () => {
    const error = new TypeError('Internal error: boom');
    const r = await logError(
      { where: 'acp-client', message: 'x', detail: error },
      { logsDir: dir },
    );
    const rec = await findError(r.ref, { logsDir: dir });
    expect(rec?.detail).toMatchObject({
      error_class: 'TypeError',
      message: 'Internal error: boom',
    });
  });

  it('names the class of a detail that is not JSON (a cycle) instead of [object Object]', async () => {
    class Handle {
      self: unknown = this;
    }
    const r = await logError({ where: 'x', message: 'x', detail: new Handle() }, { logsDir: dir });
    const rec = await findError(r.ref, { logsDir: dir });
    expect(rec?.detail).toBe('[Handle]');
  });

  it('finds a ref in an older file', async () => {
    const old = await logError(
      { where: 'w', message: 'old' },
      { logsDir: dir, now: new Date('2026-09-20T00:00:00Z') },
    );
    await logError(
      { where: 'w', message: 'new' },
      { logsDir: dir, now: new Date('2026-10-05T00:00:00Z') },
    );
    expect((await findError(old.ref, { logsDir: dir }))?.message).toBe('old');
  });

  it('never writes credentials', async () => {
    const pw = 'fake-password-not-real';
    const r = await logError(
      {
        where: `login ${pw}`,
        message: `failed with ${pw}`,
        detail: {
          body: `pw=${encodeURIComponent(pw)}`,
          nested: [pw],
          password: pw,
          err: new Error(pw),
        },
      },
      { logsDir: dir, secrets: [pw] },
    );
    expect(r.logged).toBe(true);
    const files = await readdir(dir);
    const text = await readFile(join(dir, files[0]!), 'utf8');
    expect(text).not.toContain(pw);
    expect(text).toContain('[secret]');
  });

  it('sweeps only files older than 30 days', async () => {
    const now = new Date('2026-10-05T12:00:00Z');
    for (const d of ['2026-08-01', '2026-09-04', '2026-09-05', '2026-10-05']) {
      await writeFile(join(dir, `${d}.jsonl`), '{}\n');
    }
    await writeFile(join(dir, 'notes.txt'), 'keep');
    const removed = await sweepErrorLogs({ logsDir: dir, now });
    expect(removed.sort()).toEqual(['2026-08-01.jsonl', '2026-09-04.jsonl']);
    expect((await readdir(dir)).sort()).toEqual([
      '2026-09-05.jsonl',
      '2026-10-05.jsonl',
      'notes.txt',
    ]);
  });

  it('sweep on a missing folder does nothing', async () => {
    expect(await sweepErrorLogs({ logsDir: join(dir, 'missing') })).toEqual([]);
  });

  it('returns logged:false when the folder is not writable', async () => {
    // a file where the folder should be: mkdir and append fail regardless of user privileges
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'x');
    const r = await logError({ where: 'w', message: 'm' }, { logsDir: join(blocker, 'logs') });
    expect(r.logged).toBe(false);
    expect(isErrorRef(r.ref)).toBe(true);
  });
});
