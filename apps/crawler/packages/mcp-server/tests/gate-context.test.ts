import { describe, expect, it } from 'vitest';
import type { RunState } from '../src/runtime/run-state.js';
import { gateContext } from '../src/runtime/pipeline/gate.js';

/** The parts of a run's state that `gateContext` reads. */
const runState = (kind: { isTrace?: boolean; isProbe?: boolean }): RunState =>
  ({
    isTrace: kind.isTrace ?? false,
    isProbe: kind.isProbe ?? false,
    scope: { max_depth: 6 },
    effective: { portal: { denylist: [] }, effectiveMaxActionClass: 'mutating' },
    ruleSet: {},
    robots: { registry: {} },
  }) as unknown as RunState;

const usage = { depth: 7, states: 0, actionsInState: 0, elapsedMs: 0, steps: 0 };

describe('gateContext depth budget', () => {
  it('keeps the map depth limit in a map run', () => {
    expect(gateContext(runState({}), usage).scope.max_depth).toBe(6);
  });

  it('lifts it in a trace run and in a probe run (spec 032 F-23)', () => {
    // Live, a probe run's 7th marked page was refused "depth 7 exceeds 6": each probed step
    // left the browser deeper, and a probe run does not explore.
    expect(gateContext(runState({ isTrace: true }), usage).scope.max_depth).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(gateContext(runState({ isProbe: true }), usage).scope.max_depth).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
