import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { it } from 'vitest';
import { RESULTS_FILE } from './paths.js';

/**
 * A catalogue id (`LO-13`), a finding (`F-10@004`: finding F-10 of spec 004) or a scar of
 * apps/scar-maker (`SC-01`, spec 030).
 */
export const CASE_ID = /^(LO-\d{2,}|F-\d{2}@\d{3}|SC-\d{2,})$/;

export type CaseResult = 'pass' | 'fail' | 'known_gap' | 'gap_fixed' | 'skipped_slow';

function record(id: string, title: string, result: CaseResult, ms: number, note?: string): void {
  mkdirSync(dirname(RESULTS_FILE), { recursive: true });
  appendFileSync(
    RESULTS_FILE,
    `${JSON.stringify({ id, title, result, ms, ...(note ? { note } : {}) })}\n`,
  );
}

/** `pnpm test:slow` sets this: cases marked `slow` run only then (spec 009 SC-006). */
const SLOW = process.env.MUDPUPPY_SLOW_GATES === '1';

interface CaseOpts {
  timeout?: number;
  /** Real waits (session expiry, fresh browsers): skipped by `pnpm test`, run by `pnpm test:slow`. */
  slow?: boolean;
}

function check(id: string): void {
  if (!CASE_ID.test(id)) throw new Error(`gate id ${id} is neither LO-nn, F-nn@spec nor SC-nn`);
}

/** True when the case is skipped in this run; the report still lists it as `skipped_slow`. */
function skipped(id: string, title: string, opts: CaseOpts): boolean {
  if (!opts.slow || SLOW) return false;
  record(id, title, 'skipped_slow', 0, 'slow case: runs in pnpm test:slow');
  return true;
}

/**
 * One gate case: the behaviour MudPuppy must keep for a catalogued obstacle or a logged finding
 * (spec 009 FR-024). Fails the test run when broken; the test name starts with the id.
 */
export function gate(
  id: string,
  title: string,
  fn: () => Promise<void>,
  opts: CaseOpts = {},
): void {
  check(id);
  it.skipIf(skipped(id, title, opts))(
    `${id} ${title}`,
    async () => {
      const t = Date.now();
      try {
        await fn();
      } catch (e) {
        record(id, title, 'fail', Date.now() - t, (e as Error).message.split('\n')[0]);
        throw e;
      }
      record(id, title, 'pass', Date.now() - t);
    },
    opts.timeout,
  );
}

/**
 * A known gap: MudPuppy does not handle this obstacle yet. The assertions describe the WANTED
 * behaviour and are expected to fail; the run stays green and the report lists the gap. The day
 * they pass, this case fails ("gap fixed") so it is promoted to `gate()` and kept from then on.
 */
export function gap(
  id: string,
  title: string,
  reason: string,
  fn: () => Promise<void>,
  opts: CaseOpts = {},
): void {
  check(id);
  it.skipIf(skipped(id, title, opts))(
    `${id} [known gap] ${title}`,
    async () => {
      const t = Date.now();
      try {
        await fn();
      } catch {
        record(id, title, 'known_gap', Date.now() - t, reason);
        return;
      }
      record(id, title, 'gap_fixed', Date.now() - t);
      throw new Error(`${id}: the known gap is fixed; change gap() to gate() so it stays fixed`);
    },
    opts.timeout,
  );
}
