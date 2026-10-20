import { describe, expect, it } from 'vitest';
import {
  processInstances,
  traceVariants,
  type JourneyStep,
  type ProcessShape,
} from '../src/index.js';

// Spec 039 T073 (design § 13.1): instances of a process in journeys, and their trace variants.

const quote: ProcessShape = {
  id: 'prc',
  startScreen: 'VEH',
  members: new Set(['VEH', 'DRV', 'RES']),
  terminals: new Set(['RES']),
};

/** A journey from screen to screen; `opts` marks a step's result or global navigation. */
function journey(
  id: string,
  screens: string[],
  opts: Record<number, Partial<JourneyStep>> = {},
): JourneyStep[] {
  return screens.slice(1).map((to, i) => ({
    transitionId: `${id}-t${i + 1}`,
    journeyId: id,
    seq: i + 1,
    fromScreen: screens[i]!,
    toScreen: to,
    result: 'ok',
    global: false,
    ...opts[i + 1],
  }));
}

describe('processInstances', () => {
  it('starts at the trigger, not at the home page, and completes on a terminal', () => {
    const [i] = processInstances([quote], journey('j1', ['HOME', 'CAR', 'VEH', 'DRV', 'RES']));
    expect(i).toEqual({
      processId: 'prc',
      journeyId: 'j1',
      triggerTransitionId: 'j1-t2',
      lastTransitionId: 'j1-t4',
      outcome: 'completed',
      outcomeScreen: 'RES',
      screens: ['VEH', 'DRV', 'RES'],
    });
  });

  it('tells error, exit, abandonment and an unfinished walk apart', () => {
    const outcomes = (screens: string[], opts: Record<number, Partial<JourneyStep>> = {}) =>
      processInstances([quote], journey('j', screens, opts)).map((i) => [
        i.outcome,
        i.outcomeScreen,
      ]);
    expect(outcomes(['CAR', 'VEH', 'DRV'], { 2: { result: 'business_error' } })).toEqual([
      ['error', 'DRV'],
    ]);
    expect(outcomes(['CAR', 'VEH', 'EXIT'])).toEqual([['exited', 'EXIT']]);
    expect(outcomes(['CAR', 'VEH', 'HOME'], { 2: { global: true } })).toEqual([
      ['abandoned', 'VEH'],
    ]);
    expect(outcomes(['CAR', 'VEH', 'DRV'])).toEqual([['incomplete', 'DRV']]);
  });

  it('needs a non-global trigger from outside the process, and finds a second entry', () => {
    expect(
      processInstances([quote], journey('j', ['HOME', 'VEH'], { 1: { global: true } })),
    ).toEqual([]);
    const two = processInstances(
      [quote],
      journey('j', ['CAR', 'VEH', 'EXIT', 'VEH', 'DRV', 'RES']),
    );
    expect(two.map((i) => [i.triggerTransitionId, i.outcome])).toEqual([
      ['j-t1', 'exited'],
      ['j-t3', 'completed'],
    ]);
  });
});

describe('traceVariants', () => {
  it('counts distinct screen sequences, the most walked first', () => {
    const all = [
      ...processInstances([quote], journey('a', ['CAR', 'VEH', 'DRV', 'RES'])),
      ...processInstances([quote], journey('b', ['CAR', 'VEH', 'DRV', 'RES'])),
      ...processInstances([quote], journey('c', ['CAR', 'VEH', 'RES'])),
    ];
    expect(traceVariants(all)).toEqual([
      { screens: ['VEH', 'DRV', 'RES'], outcome: 'completed', count: 2 },
      { screens: ['VEH', 'RES'], outcome: 'completed', count: 1 },
    ]);
  });
});
