import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { acquireEvalLock } from '../harness/lock.js';

const lockPath = () => join(mkdtempSync(join(tmpdir(), 'pf-lock-')), 'eval.lock');

it('takes a free lock and releases it', () => {
  const path = lockPath();
  const lock = acquireEvalLock(path);
  expect(lock.ok).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe(String(process.pid));
  if (lock.ok) lock.release();
  expect(existsSync(path)).toBe(false);
});

it('refuses while a live process holds it, naming the pid', () => {
  const path = lockPath();
  // The parent of this test process is alive and is not us.
  writeFileSync(path, String(process.ppid));
  expect(acquireEvalLock(path)).toEqual({ ok: false, pid: process.ppid });
});

it('takes over a stale lock whose process is gone', () => {
  const path = lockPath();
  writeFileSync(path, '999999999');
  expect(acquireEvalLock(path).ok).toBe(true);
});

it('does not remove a lock another process took over meanwhile', () => {
  const path = lockPath();
  const lock = acquireEvalLock(path);
  writeFileSync(path, String(process.ppid));
  if (lock.ok) lock.release();
  expect(readFileSync(path, 'utf8')).toBe(String(process.ppid));
});
