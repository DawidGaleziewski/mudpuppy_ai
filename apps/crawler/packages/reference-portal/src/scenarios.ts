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

/** The release every page loads unless a scenario ships another: its bundle names the build. */
export const BASE_BUILD = '3e1a9c21';
const DEPLOYED_BUILD = '9c21aa07';

/**
 * What a built scenario does to the portal: the build it ships, how it changes a page's HTML, and
 * which GET requests it answers with a server error.
 */
interface ScenarioEffect {
  build?: string;
  html?: (path: string, html: string) => string;
  fails?: (path: string, params: Readonly<Record<string, string>>) => boolean;
}

/** The value of the vehicle form's model field that the deterministic-error scenario breaks. */
export const FAILING_MODEL = 'Błąd';

/** Built scenarios and their effects (each lands with the milestone whose rule it checks). */
const EFFECTS: Partial<Record<ScenarioId, ScenarioEffect>> = {
  // M3: a new bundle hash and one more field on the vehicle form → structural_drift (R2).
  deployment: {
    build: DEPLOYED_BUILD,
    html: (path, html) =>
      path === '/kalkulator/pojazd'
        ? html.replace(
            '<p><button type="submit">Dalej</button></p>',
            '<p><label for="drzwi">Liczba drzwi</label> <input id="drzwi" name="drzwi" type="number" min="2" max="5"></p>\n<p><button type="submit">Dalej</button></p>',
          )
        : html,
  },
  // M3: the vehicle form answers HTTP 500 every time for one model name → deterministic_error (R1).
  'deterministic-error': {
    fails: (path, params) =>
      path === '/kalkulator/pojazd' && params.krok === '1' && params.model === FAILING_MODEL,
  },
};

/** True when a built scenario answers this GET request with a server error. */
export function failsUnder(
  path: string,
  params: Readonly<Record<string, string>>,
  scenarios: readonly ScenarioId[],
): boolean {
  return scenarios.some((s) => EFFECTS[s]?.fails?.(path, params) === true);
}

/** The server error page: short, so the crawler reads it as a technical error, not a screen. */
export const SERVER_ERROR_PAGE =
  '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Błąd</title></head>' +
  '<body><h1>Błąd techniczny</h1><p>Wystąpił błąd techniczny. Spróbuj ponownie później.</p></body></html>';

/** Scenarios whose injection exists. Grows as each milestone builds its scenarios. */
export const BUILT_SCENARIOS: ReadonlySet<ScenarioId> = new Set(
  Object.keys(EFFECTS) as ScenarioId[],
);

/** The build the instance serves: the last built scenario that ships one, else the base. */
export function buildOf(scenarios: readonly ScenarioId[]): string {
  const shipped = scenarios.map((s) => EFFECTS[s]?.build).filter((b) => b !== undefined);
  return shipped.at(-1) ?? BASE_BUILD;
}

/**
 * A page's HTML as the instance serves it: the release's bundle in the head (so the crawler can
 * name the build), then each scenario's change in order.
 */
export function applyScenarios(
  path: string,
  html: string,
  scenarios: readonly ScenarioId[],
): string {
  let out = html.replace(
    '</head>',
    `<script src="/static/app.${buildOf(scenarios)}.js"></script></head>`,
  );
  for (const s of scenarios) out = EFFECTS[s]?.html?.(path, out) ?? out;
  return out;
}

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
