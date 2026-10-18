import { z } from 'zod';

/**
 * The scenario switchboard (spec 039 design § 19.1, T005): flags that each inject one known change
 * into the reference portal, so every reconciler rule has ground truth. A scenario is switched on
 * by `REFERENCE_SCENARIOS=a,b` (or `StartOptions.scenarios`); `built` says whether its injection
 * exists yet. Each one lands with the milestone whose rule it checks, as a gate.
 */
export const SCENARIOS = {
  deployment: {
    injects: 'a new bundle hash plus one added form field',
    expects: 'structural_drift, derived, epoch boundary at the switch',
    milestone: 'M3',
  },
  'persona-variant': {
    injects: 'a button shown only to segment premium',
    expects: 'context_variant; a decision rule on persona.segment',
    milestone: 'M3',
  },
  'ab-test': {
    injects: 'banner text for 50% of sessions, by cookie',
    expects: 'ab_test naming the cookie',
    milestone: 'M3',
  },
  'flaky-page': {
    injects: 'HTTP 500 on 20% of loads of one page',
    expects: 'flaky, derived',
    milestone: 'M3',
  },
  'deterministic-error': {
    injects: 'HTTP 500 for one input value',
    expects: 'deterministic_error, waiting for a person',
    milestone: 'M3',
  },
  'moved-link': {
    injects: 'a link moves from the body into the menu',
    expects: 'replaces, derived; one screen pair on the Map',
    milestone: 'M2',
  },
  'renamed-button': {
    injects: 'label changes, position stays',
    expects: 'replaces',
    milestone: 'M3',
  },
  'removed-link': {
    injects: 'a link removed with a deployment',
    expects: 'removed, derived; status retired',
    milestone: 'M3',
  },
  'not-visited': {
    injects: 'a screen the run is told to skip',
    expects: 'untested, never removed',
    milestone: 'M2',
  },
  'threshold-rule': {
    injects: 'exit page when age < 18',
    expects: 'rule with t = 18; boundary tests at 17, 18 and 19',
    milestone: 'M4',
  },
  'overlapping-rule': {
    injects: '30% of standard customers sent to a manual-review page at random',
    expects: 'hit policy C plus a nondeterministic hypothesis',
    milestone: 'M4',
  },
  'rule-drift': {
    injects: 'threshold moves to 21 with a deployment',
    expects: 'rule_mismatch, then decision_drift within one run',
    milestone: 'M4',
  },
  'repeated-rows': {
    injects: '"add another driver" adds rows',
    expects: 'one screen; no new members once rows collapse',
    milestone: 'M2',
  },
  'numbered-sections': {
    injects: '/sekcja/1 to /sekcja/6 with different forms',
    expects: 'the path parameter becomes identity; six screens',
    milestone: 'M2',
  },
} as const satisfies Record<string, { injects: string; expects: string; milestone: string }>;

export type ScenarioId = keyof typeof SCENARIOS;

/** Scenarios whose injection exists. Grows as each milestone builds its scenarios. */
export const BUILT_SCENARIOS: ReadonlySet<ScenarioId> = new Set<ScenarioId>([]);

const ScenarioIdSchema = z.enum(Object.keys(SCENARIOS) as [ScenarioId, ...ScenarioId[]]);

/**
 * Parse `REFERENCE_SCENARIOS` ("deployment,ab-test"): unknown ids and scenarios not built yet are
 * refused, so a gate never passes against a scenario that injects nothing.
 */
export function parseScenarios(value: string | undefined): ScenarioId[] {
  const ids = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ids)].map((raw) => {
    const id = ScenarioIdSchema.safeParse(raw);
    if (!id.success)
      throw new Error(`unknown scenario "${raw}"; known: ${Object.keys(SCENARIOS).join(', ')}`);
    if (!BUILT_SCENARIOS.has(id.data))
      throw new Error(
        `scenario "${raw}" is not built yet (lands in ${SCENARIOS[id.data].milestone})`,
      );
    return id.data;
  });
}
