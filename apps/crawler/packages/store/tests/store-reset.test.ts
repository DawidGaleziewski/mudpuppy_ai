import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StoreResetRefused, applyStoreReset, planStoreReset } from '../src/store-reset.js';

function fakeData(): string {
  const data = join(mkdtempSync(join(tmpdir(), 'reset-')), 'data');
  const put = (rel: string, body = 'x') => {
    mkdirSync(join(data, rel, '..'), { recursive: true });
    writeFileSync(join(data, rel), body);
  };
  put('db/.gitkeep', '');
  put('db/sandbox.sqlite', 'store');
  put('evidence/.gitkeep', '');
  put('evidence/ab.yaml');
  put('traces/run-1/trace.zip', 'trace');
  symlinkSync(join(data, 'migrations'), join(data, 'traces/run-1/linked')); // not followed
  put('migrations/0001_init.up.sql', 'kept');
  put('evals/reference-insurer/2026-10-18T13-03-10-082Z.json');
  put('evals/reference-insurer/baseline.json');
  put('evals/reference-insurer/history/2026-10-09T00-00-00-000Z.json');
  put('evals/proving-ground-shop/tolerances.json', 'kept');
  put('evals/judges/labels.yaml', 'kept');
  return data;
}

describe('store reset (spec 039 T002)', () => {
  it('plans deleting generated data and moving v1 eval files, keeping .gitkeep and the rest', () => {
    const data = fakeData();
    const plan = planStoreReset(data);
    const deleted = plan.deletes.map((d) => d.path.slice(data.length + 1)).sort();
    expect(deleted).toEqual(['db/sandbox.sqlite', 'evidence/ab.yaml', 'traces/run-1']);
    const link = lstatSync(join(data, 'traces/run-1/linked')).size;
    expect(plan.deletes.find((d) => d.path.endsWith('run-1'))?.bytes).toBe(5 + link);
    const moved = plan.moves.map((m) => m.to.slice(data.length + 1)).sort();
    expect(moved).toEqual([
      'evals/reference-insurer/history/v1/2026-10-09T00-00-00-000Z.json',
      'evals/reference-insurer/history/v1/2026-10-18T13-03-10-082Z.json',
      'evals/reference-insurer/history/v1/baseline.json',
    ]);
  });

  it('applies the plan and writes RESET-v2.md', () => {
    const data = fakeData();
    applyStoreReset(planStoreReset(data), {
      blockers: [],
      gitSha: 'abc1234',
      now: '2026-10-18T22:00:00.000Z',
    });
    expect(existsSync(join(data, 'db/sandbox.sqlite'))).toBe(false);
    expect(existsSync(join(data, 'db/.gitkeep'))).toBe(true);
    expect(existsSync(join(data, 'migrations/0001_init.up.sql'))).toBe(true);
    expect(existsSync(join(data, 'evals/reference-insurer/history/v1/baseline.json'))).toBe(true);
    expect(existsSync(join(data, 'evals/reference-insurer/baseline.json'))).toBe(false);
    expect(readFileSync(join(data, 'evals/judges/labels.yaml'), 'utf8')).toBe('kept');
    const note = readFileSync(join(data, 'RESET-v2.md'), 'utf8');
    expect(note).toContain('git abc1234');
    expect(note).toContain('`data/traces/run-1`');
  });

  it('refuses while something blocks it, changing nothing', () => {
    const data = fakeData();
    expect(() =>
      applyStoreReset(planStoreReset(data), {
        blockers: ['pid 42 holds data/db: node main.ts'],
        gitSha: 'abc1234',
        now: '2026-10-18T22:00:00.000Z',
      }),
    ).toThrow(StoreResetRefused);
    expect(existsSync(join(data, 'db/sandbox.sqlite'))).toBe(true);
  });
});
