/**
 * Process instances (spec 039 design § 13.1, T073): a journey enters a process through a trigger
 * (a non-global transition from a screen outside the process into its start screen) and walks its
 * member screens until an outcome. The pages walked before the trigger are its entry path, never
 * steps (R-77). Trace variants are the distinct screen sequences of the instances. Pure.
 */

/** One executed transition of a journey, on model screens. */
export interface JourneyStep {
  transitionId: string;
  journeyId: string;
  seq: number;
  fromScreen: string | null;
  toScreen: string | null;
  result: string | null;
  /** The action class is global navigation (a menu, the logo). */
  global: boolean;
}

/** What the instances of one process are found from. */
export interface ProcessShape {
  id: string;
  startScreen: string;
  /** Every screen of the process, the start screen included. */
  members: ReadonlySet<string>;
  /** Members no non-global transition of the process leaves (where it completes). */
  terminals: ReadonlySet<string>;
}

export type InstanceOutcome = 'completed' | 'exited' | 'error' | 'abandoned' | 'incomplete';

export interface ProcessInstance {
  processId: string;
  journeyId: string;
  triggerTransitionId: string;
  lastTransitionId: string;
  outcome: InstanceOutcome;
  /** The screen the outcome was seen on (the error, the exit page, the last member). */
  outcomeScreen: string | null;
  /** The member screens walked, start screen first: the trace variant. */
  screens: string[];
}

/** How one walk ends at `s` (null: it goes on). */
function endAt(
  p: ProcessShape,
  s: JourneyStep,
): { outcome: InstanceOutcome; screen: string | null } | null {
  if (s.result === 'business_error')
    return { outcome: 'error', screen: s.toScreen ?? s.fromScreen };
  if (s.global) return { outcome: 'abandoned', screen: s.fromScreen };
  if (s.toScreen !== null && !p.members.has(s.toScreen))
    return { outcome: 'exited', screen: s.toScreen };
  return null;
}

/** The instances of `process` in one journey (its steps in `seq` order). */
function inJourney(p: ProcessShape, steps: readonly JourneyStep[]): ProcessInstance[] {
  const out: ProcessInstance[] = [];
  let i = 0;
  while (i < steps.length) {
    const t = steps[i]!;
    const trigger =
      t.toScreen === p.startScreen &&
      !t.global &&
      (t.fromScreen === null || !p.members.has(t.fromScreen));
    if (!trigger) {
      i += 1;
      continue;
    }
    const screens = [p.startScreen];
    let last = t;
    let end: { outcome: InstanceOutcome; screen: string | null } | null = null;
    let j = i + 1;
    for (; j < steps.length && !end; j++) {
      const s = steps[j]!;
      last = s;
      end = endAt(p, s);
      if (!end && s.toScreen !== null && s.toScreen !== screens[screens.length - 1])
        screens.push(s.toScreen);
    }
    const at = screens[screens.length - 1]!;
    end ??= p.terminals.has(at)
      ? { outcome: 'completed', screen: at }
      : { outcome: 'incomplete', screen: at };
    out.push({
      processId: p.id,
      journeyId: t.journeyId,
      triggerTransitionId: t.transitionId,
      lastTransitionId: last.transitionId,
      outcome: end.outcome,
      outcomeScreen: end.screen,
      screens,
    });
    i = j;
  }
  return out;
}

/** Every instance of every process over the journeys (steps in any order). */
export function processInstances(
  processes: readonly ProcessShape[],
  steps: readonly JourneyStep[],
): ProcessInstance[] {
  const byJourney = new Map<string, JourneyStep[]>();
  for (const s of steps) {
    const list = byJourney.get(s.journeyId) ?? [];
    list.push(s);
    byJourney.set(s.journeyId, list);
  }
  const journeys = [...byJourney.keys()].sort();
  return processes.flatMap((p) =>
    journeys.flatMap((j) =>
      inJourney(
        p,
        byJourney.get(j)!.sort((a, b) => a.seq - b.seq),
      ),
    ),
  );
}

/** The trace variants of a process: distinct screen sequences with how often each was walked. */
export function traceVariants(
  instances: readonly Pick<ProcessInstance, 'screens' | 'outcome'>[],
): { screens: string[]; outcome: InstanceOutcome; count: number }[] {
  const seen = new Map<string, { screens: string[]; outcome: InstanceOutcome; count: number }>();
  for (const i of instances) {
    const k = `${i.screens.join('>')}|${i.outcome}`;
    const v = seen.get(k) ?? { screens: i.screens, outcome: i.outcome, count: 0 };
    v.count += 1;
    seen.set(k, v);
  }
  return [...seen.values()].sort(
    (a, b) => b.count - a.count || (a.screens.join('>') < b.screens.join('>') ? -1 : 1),
  );
}
