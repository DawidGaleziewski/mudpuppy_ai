import { describe, expect, it } from 'vitest';
import { bestRun } from '../src/services/trace-grouping.js';
import type { DriveResult } from '../src/trace-driver.js';

// Spec 031 US5: which variant's screens stand for the process the trace driver proposes.

const r = (variant: string, outcome: DriveResult['outcome'], steps: number, runId: string | null) =>
  ({ trace: 't', variant, outcome, steps, runId }) satisfies DriveResult;

describe('bestRun', () => {
  it('takes the first run that reached its goal, else the longest, never one that did not start', () => {
    expect(bestRun([r('a', 'abandoned', 9, 'r1'), r('b', 'goal_reached', 3, 'r2')])?.variant).toBe(
      'b',
    );
    expect(
      bestRun([r('a', 'abandoned', 2, 'r1'), r('b', 'boundary_reached', 5, 'r2')])?.variant,
    ).toBe('b');
    expect(bestRun([r('a', 'goal_reached', 4, null)])).toBeNull();
    expect(bestRun([])).toBeNull();
  });
});
