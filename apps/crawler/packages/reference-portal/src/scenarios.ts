import { z } from 'zod';
import { layout } from './html.js';
import { ageOn, CURRENT_YEAR, MIN_DRIVER_AGE } from './rules.js';

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
    injects:
      "HTTP 500 on 3 of every 5 loads of one page (in a row, past the crawler's two re-opens)",
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
  'menu-link': {
    injects: 'one link added to the main menu of every page',
    expects: 'every screen kept, under rows-v2 and a no-menu profile (T114)',
    milestone: 'M2',
  },
} as const satisfies Record<string, { injects: string; expects: string; milestone: string }>;

export type ScenarioId = keyof typeof SCENARIOS;

/** The release every page loads unless a scenario ships another: its bundle names the build. */
export const BASE_BUILD = '3e1a9c21';
const DEPLOYED_BUILD = '9c21aa07';
const REMOVAL_BUILD = 'b7d40e15';
const DRIFT_BUILD = 'd5e2b9c4';
/** The home page's "renew a policy" shortcut, which removed-link drops and moved-link moves. */
const RENEW_SHORTCUT = '<li><a href="/moje-polisy/przedluz">Przedłuż polisę</a></li>';

/**
 * What a built scenario does to the portal: the build it ships, how it changes a page's HTML, and
 * which GET requests it answers with a server error.
 */
/** Who is visiting (spec 046): the logged-in customer's segment and the A/B arm of the session. */
export interface Visit {
  segment: 'standard' | 'premium' | null;
  abArm: 'A' | 'B' | null;
}

export const NO_VISIT: Visit = { segment: null, abArm: null };

/** The A/B cookie of scenario ab-test (spec 046 FR-003). */
export const AB_COOKIE = 'ab_baner';

const AB_BANNERS = {
  A: '<p role="note">Nowość: ubezpieczenie turystyczne już od 12 zł za dzień.</p>',
  B: '<p role="note">Promocja: 10% zniżki z kodem rabatowym na OC.</p>',
} as const;

interface ScenarioEffect {
  build?: string;
  html?: (path: string, html: string, visit: Visit) => string;
  /** `before`: how many times this very address was loaded before on this instance. */
  fails?: (path: string, params: Readonly<Record<string, string>>, before: number) => boolean;
  /** A page only this scenario serves (null: not one of its paths). Not in the ground truth. */
  page?: (path: string, params: Readonly<Record<string, string>>) => string | null;
}

/** "Add another driver" adds a row: one to six driver rows of the same shape. */
function driversPage(path: string, params: Readonly<Record<string, string>>): string | null {
  if (path !== '/kierowcy') return null;
  const n = Math.min(6, Math.max(1, Number(params.n ?? '1') || 1));
  const rows = Array.from(
    { length: n },
    (_, i) =>
      `<li><h3>Kierowca ${i + 1}</h3><p><label for="imie${i + 1}">Imię</label> <input id="imie${i + 1}" name="imie${i + 1}"></p>` +
      `<p><label for="rok${i + 1}">Rok urodzenia</label> <input id="rok${i + 1}" name="rok${i + 1}" type="number"></p></li>`,
  ).join('\n');
  return layout(
    'Dodatkowi kierowcy',
    `<form aria-label="Kierowcy" method="get" action="/kierowcy">\n<ul>\n${rows}\n</ul>\n` +
      `<p><a href="/kierowcy?n=${Math.min(6, n + 1)}">Dodaj kierowcę</a></p></form>`,
  );
}

/** Six numbered sections, each a different form: the number is the screen. */
const SECTION_FIELDS: readonly (readonly string[])[] = [
  ['Imię', 'Nazwisko'],
  ['Ulica', 'Miasto', 'Kod pocztowy'],
  ['Numer polisy'],
  ['Marka', 'Model', 'Rok produkcji', 'Przebieg'],
  ['Adres e-mail', 'Telefon'],
  ['Uwagi'],
];

function sectionPage(path: string): string | null {
  const m = /^\/sekcja\/([1-6])$/.exec(path);
  if (!m) return null;
  const fields = SECTION_FIELDS[Number(m[1]) - 1]!;
  const inputs = fields
    .map((f, i) => `<p><label for="f${i}">${f}</label> <input id="f${i}" name="f${i}"></p>`)
    .join('\n');
  return layout(
    `Wniosek: sekcja ${m[1]}`,
    `<form aria-label="Sekcja ${m[1]}" method="get" action="${path}">\n${inputs}\n<p><button type="submit">Zapisz</button></p></form>`,
  );
}

/** The exit page of threshold-rule: a driver under the minimum age is refused on a page of its own. */
function refusalPage(path: string, params: Readonly<Record<string, string>>): string | null {
  const birth = params.data_urodzenia ?? '';
  if (path !== '/kalkulator/kierowca' || params.krok !== '2' || !/^\d{4}-\d{2}-\d{2}$/.test(birth))
    return null;
  if (ageOn(birth) >= MIN_DRIVER_AGE) return null;
  return layout(
    'Nie możemy Cię ubezpieczyć',
    `<p>Kierowca musi mieć co najmniej ${MIN_DRIVER_AGE} lat, aby zawrzeć umowę OC/AC.</p>\n<p><a href="/">Wróć na stronę główną</a></p>`,
  );
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
  // M3: a release drops the "renew a policy" shortcut from the home page → removed, derived (R6).
  'removed-link': {
    build: REMOVAL_BUILD,
    html: (path, html) => (path === '/' ? html.replace(RENEW_SHORTCUT, '') : html),
  },
  // M2: the "renew a policy" shortcut moves from the home page's body into the menu, same release
  // → replaces, derived (R6); its element key changes with its container.
  'moved-link': {
    // Out of the body first: the menu comes before it in the page.
    html: (path, html) =>
      (path === '/' ? html.replace(RENEW_SHORTCUT, '') : html).replace(
        '<li><a href="/moje-polisy">Moje polisy</a></li>',
        `<li><a href="/moje-polisy">Moje polisy</a></li>${RENEW_SHORTCUT}`,
      ),
  },
  // M3: the vehicle form's button is renamed in place, same release → replaces, derived (R6).
  'renamed-button': {
    html: (path, html) =>
      path === '/kalkulator/pojazd'
        ? html.replace(
            '<p><button type="submit">Dalej</button></p>',
            '<p><button type="submit">Przejdź dalej</button></p>',
          )
        : html,
  },
  // M4: a release raises the minimum driver age to 21 → rule_mismatch, then decision_drift (R8).
  // In the browser only: the date field's `max` refuses the submit, the server still says 18.
  'rule-drift': {
    build: DRIFT_BUILD,
    html: (path, html) =>
      path === '/kalkulator/kierowca'
        ? html
            .replace(
              `max="${CURRENT_YEAR - MIN_DRIVER_AGE}-01-15"`,
              `max="${CURRENT_YEAR - 21}-01-15"`,
            )
            .replace(`od ${MIN_DRIVER_AGE} do`, 'od 21 do')
        : html,
  },
  // M2 (T114): the main menu gains a link on every page, same release → every screen is kept.
  'menu-link': {
    html: (_path, html) =>
      html.replace(
        '<li><a href="/moje-polisy">Moje polisy</a></li>',
        '<li><a href="/moje-polisy">Moje polisy</a></li><li><a href="/logowanie">Zaloguj się</a></li>',
      ),
  },
  // M2: /kierowcy?n=1..6 shows that many driver rows → one screen; rows collapse (F-02).
  'repeated-rows': { page: driversPage },
  // M2: /sekcja/1 to /sekcja/6, a different form each → the path parameter is identity, six screens.
  'numbered-sections': { page: (path) => sectionPage(path) },
  // M3: the vehicle form answers HTTP 500 every time for one model name → deterministic_error (R1).
  'deterministic-error': {
    fails: (path, params) =>
      path === '/kalkulator/pojazd' && params.krok === '1' && params.model === FAILING_MODEL,
  },
  // M4 (spec 040 T036): a driver under 18 is sent to an exit page instead of a message on the form
  // (the date field's `max` is gone, so the browser submits) → a decision rule with t = 18.
  'threshold-rule': {
    html: (path, html) =>
      path === '/kalkulator/kierowca'
        ? html.replace(` max="${CURRENT_YEAR - MIN_DRIVER_AGE}-01-15"`, '')
        : html,
    page: refusalPage,
  },
  // M3 (spec 040 T036): the vehicle form's submit answers HTTP 500 on the 2nd to 4th of every five
  // loads of the same address (deterministic, so a test knows which; three in a row, since the
  // crawler re-opens a page twice after a passing error, TRANSIENT_RETRIES) → flaky, derived (R1).
  'flaky-page': {
    fails: (path, params, before) =>
      path === '/kalkulator/pojazd' && params.krok === '1' && [1, 2, 3].includes(before % 5),
  },
  // M3 (spec 046): the premium customer sees one more button on Moje polisy → context_variant (R4).
  'persona-variant': {
    html: (path, html, visit) =>
      path === '/moje-polisy' && visit.segment === 'premium'
        ? html.replace(
            '<p><a href="/moje-polisy/przedluz">Przedłuż polisę</a></p>',
            '<p><a href="/moje-polisy/przedluz">Przedłuż polisę</a></p>\n<p><button type="button">Oferta dla klientów premium</button></p>',
          )
        : html,
  },
  // M3 (spec 046): the home page's banner by the session's A/B cookie, given in turn → ab_test (R5).
  'ab-test': {
    html: (path, html, visit) =>
      path === '/' && visit.abArm
        ? html.replace(
            '<section aria-labelledby="produkty">',
            `${AB_BANNERS[visit.abArm]}\n<section aria-labelledby="produkty">`,
          )
        : html,
  },
};

/** The page a built scenario serves at this path, if one does. */
export function scenarioPage(
  path: string,
  params: Readonly<Record<string, string>>,
  scenarios: readonly ScenarioId[],
): string | null {
  for (const s of scenarios) {
    const page = EFFECTS[s]?.page?.(path, params) ?? null;
    if (page !== null) return page;
  }
  return null;
}

/** True when a built scenario answers this GET request with a server error. */
export function failsUnder(
  path: string,
  params: Readonly<Record<string, string>>,
  scenarios: readonly ScenarioId[],
  before = 0,
): boolean {
  return scenarios.some((s) => EFFECTS[s]?.fails?.(path, params, before) === true);
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
  visit: Visit = NO_VISIT,
): string {
  let out = html.replace(
    '</head>',
    `<script src="/static/app.${buildOf(scenarios)}.js"></script></head>`,
  );
  for (const s of scenarios) out = EFFECTS[s]?.html?.(path, out, visit) ?? out;
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
