import type { Confidence } from '@mudpuppy/core';
import type { DocKind, EvidenceTargetKind } from '@mudpuppy/docs-model';
import type { GroundTruth } from './ground-truth.js';

/**
 * Goal evaluation (`docs:evaluate`, research §16, contracts/ground-truth.md; FR-063, FR-064, SC-008,
 * SC-009): how much of a portal's ground truth the documentation covers, what is missing, and where
 * it claims more certainty than a guest could have. Deterministic matching, no LLM judge. The
 * ground truth is `ground-truth.ts`; the report text `evaluate-report.ts`; the store reads
 * `evaluate-load.ts`.
 */

// ---- input, thresholds, report --------------------------------------------------------------------

export interface EvalEvidence {
  target_kind: EvidenceTargetKind;
  target_id: string;
  /** Route templates the target was seen on; for a process, every route its steps visited. */
  routes: string[];
}

/** One record as evaluated: its latest non-rejected revision (withdrawn records are left out). */
export interface EvalRecord {
  key: string;
  kind: DocKind;
  rev: number;
  confidence: Confidence;
  not_observable: boolean;
  content: Record<string, unknown>;
  evidence: EvalEvidence[];
}

export const CATEGORIES = [
  'screens',
  'fields',
  'constraints',
  'rules',
  'processes',
  'terms',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Categories scored, and shown in the report, only when the ground truth has the data: the ones a
 * v2 ground truth adds (spec 009 FR-027), and `processes_map` (spec 025 FR-005) whenever it has
 * processes.
 */
export const EXTRA_CATEGORIES = [
  'logged_in_screens',
  'obstacles',
  'entry_points',
  'processes_map',
] as const;
export type ExtraCategory = (typeof EXTRA_CATEGORIES)[number];
export type AnyCategory = Category | ExtraCategory;

/** Minimum percentage per category, and the most over-claims allowed. */
export type Thresholds = Record<Category, number> &
  Partial<Record<ExtraCategory, number>> & { overclaims: number };

/** Minimums for the v2 categories when a run does not set them. */
export const EXTRA_DEFAULTS: Record<ExtraCategory, number> = {
  logged_in_screens: 80,
  obstacles: 60,
  entry_points: 50,
  processes_map: 80,
};

/** SC-008 targets and SC-009's zero over-claims. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  screens: 90,
  fields: 90,
  constraints: 80,
  rules: 70,
  processes: 100,
  terms: 80,
  overclaims: 0,
};

export interface CategoryScore {
  matched: number;
  total: number;
  /** One decimal; 100 when the ground truth has no item in the category. */
  pct: number;
  /** Ground-truth ids not documented, sorted. */
  missing: string[];
  /** Ground-truth id → keys of the records that matched it, for checking the matcher by hand. */
  matches: Record<string, string[]>;
}

export interface Overclaim {
  ground_truth: string;
  record: string;
  rev: number;
}

export interface EvaluationReport {
  portal_id: string;
  as_of: string;
  scores: Record<Category, CategoryScore> & Partial<Record<ExtraCategory, CategoryScore>>;
  overclaims: Overclaim[];
  thresholds: Thresholds;
  passed: boolean;
  /** Categories below their minimum, plus `overclaims` when there are too many. */
  failed: string[];
}

export interface EvaluateInput {
  portal_id: string;
  as_of: string;
  records: readonly EvalRecord[];
  groundTruth: GroundTruth;
  thresholds?: Thresholds;
  /** Route templates of states the crawler handed to a human (CAPTCHA, spec 009 FR-022). */
  handoffs?: readonly string[];
}

// ---- matching ---------------------------------------------------------------------------------------

/** Case-, whitespace- and Unicode-form-insensitive comparison form. */
export const normalise = (s: string): string =>
  s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/**
 * A record's route templates as screen routes: a query written after the path still names the
 * screen (`/porownanie/wynik?produkt_1={code}` is `/porownanie/wynik`), as crawl coverage already
 * treats routes (spec 015 F-18). Ground-truth routes never carry a query; spec 019 F-09.
 */
const screenRoutes = (v: unknown): string[] => strings(v).map((r) => r.replace(/\?.*$/, ''));

/** Every string in a record's content (statement, title, criteria, table cells, …). */
function textOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textOf);
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => (k === 'kind' ? [] : textOf(v)));
  return [];
}

const routesOf = (r: EvalRecord): Set<string> => new Set(r.evidence.flatMap((e) => e.routes));

/** A number or date as a standalone token of free text (`format: "1990–2026"`). */
function mentions(text: string, value: string | number): boolean {
  const v = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^0-9A-Za-z])${v}([^0-9A-Za-z]|$)`).test(text);
}

/**
 * A claim marker in normalised text: it must start at a word boundary, and when it ends with a digit
 * it must end at one too ("18" is not found in "180" or "2018"); otherwise it may be a stem
 * ("prowizj" finds "prowizja").
 */
function hasMarker(text: string, marker: string): boolean {
  const m = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = /[0-9]$/.test(marker) ? '(?![0-9])' : '';
  return new RegExp(`(?<![\\p{L}\\p{N}])${m}${end}`, 'u').test(text);
}

type Constraints = Record<string, unknown>;

/**
 * Whether a data item's constraints state ground-truth constraint `kind` with an equal value.
 * `min`/`max` have no field in the data item schema yet, so they also match a token in `format`;
 * allowed values match when the documented list contains every true value (placeholders such as
 * "— choose —" may be extra).
 */
function constraintMatches(kind: string, truth: unknown, doc: Constraints): boolean {
  switch (kind) {
    case 'required':
      return doc.required === truth;
    case 'max_length':
      return doc.max_length === truth;
    case 'pattern':
      return (
        typeof doc.pattern_observed === 'string' &&
        doc.pattern_observed.trim() === String(truth).trim()
      );
    case 'allowed_values': {
      const have = new Set(strings(doc.allowed_values).map(normalise));
      return strings(truth).every((v) => have.has(normalise(v)));
    }
    case 'min':
    case 'max':
      if (doc[kind] !== undefined) return String(doc[kind]) === String(truth);
      return typeof doc.format === 'string' && mentions(doc.format, truth as string | number);
    default:
      return false;
  }
}

const pct = (matched: number, total: number): number =>
  total === 0 ? 100 : Math.round((matched / total) * 1000) / 10;

function score(ids: readonly string[], matches: Map<string, string[]>): CategoryScore {
  const sorted = [...ids].sort();
  const hit = sorted.filter((id) => (matches.get(id) ?? []).length > 0);
  return {
    matched: hit.length,
    total: sorted.length,
    pct: pct(hit.length, sorted.length),
    missing: sorted.filter((id) => !hit.includes(id)),
    matches: Object.fromEntries(hit.map((id) => [id, [...new Set(matches.get(id))].sort()])),
  };
}

/**
 * Processes from map evidence (spec 025 FR-005): a process record whose evidence of any kind
 * covers the first and last observable routes, or one `processes` matched. A score of its own,
 * so `processes` keeps meaning "known from a trace".
 */
function processesMapScore(
  gt: GroundTruth,
  processRecords: readonly EvalRecord[],
  processMatches: Map<string, string[]>,
): CategoryScore {
  const m = new Map<string, string[]>();
  for (const p of gt.processes) {
    const viaTrace = new Set(processMatches.get(p.id));
    const covers = (r: EvalRecord) => {
      const routes = routesOf(r);
      return routes.has(p.first_route) && routes.has(p.last_observable_route);
    };
    m.set(
      p.id,
      processRecords.filter((r) => viaTrace.has(r.key) || covers(r)).map((r) => r.key),
    );
  }
  return score([...m.keys()], m);
}

/** What every matcher reads: the ground truth and the records, sorted by key. */
interface Matching {
  gt: GroundTruth;
  records: readonly EvalRecord[];
  ofKind: (...kinds: DocKind[]) => EvalRecord[];
  screenRoute: ReadonlyMap<string, string>;
}

type GtRule = GroundTruth['rules'][number];
type GtProcess = GroundTruth['processes'][number];

/** Code-unit order (never locale order), so a report is byte-stable. */
function byKey(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Screens: a screen record listing the route template. */
function screenRecordsFor(m: Matching, route: string): string[] {
  return m
    .ofKind('screen')
    .filter((r) => screenRoutes(r.content.route_templates).includes(route))
    .map((r) => r.key);
}

/** Fields and constraints: a data item with the field's verbatim label. */
function fieldScores(m: Matching): Pick<EvaluationReport['scores'], 'fields' | 'constraints'> {
  const guestScreens = new Set(m.gt.screens.filter((s) => s.guest_visible).map((s) => s.id));
  const fieldMatches = new Map<string, string[]>();
  const constraintMatchesById = new Map<string, string[]>();
  const constraintIds: string[] = [];
  const guestFields = m.gt.forms.filter((f) => guestScreens.has(f.screen)).flatMap((f) => f.fields);
  for (const field of guestFields) {
    const items = m
      .ofKind('data_item')
      .filter(
        (r) =>
          typeof r.content.name_verbatim === 'string' &&
          normalise(r.content.name_verbatim) === normalise(field.label),
      );
    fieldMatches.set(
      field.id,
      items.map((r) => r.key),
    );
    for (const [kind, value] of Object.entries(field.constraints)) {
      if (value === undefined) continue;
      const id = `${field.id}.${kind}`;
      constraintIds.push(id);
      constraintMatchesById.set(
        id,
        items
          .filter((r) =>
            constraintMatches(kind, value, (r.content.constraints ?? {}) as Constraints),
          )
          .map((r) => r.key),
      );
    }
  }
  return {
    fields: score([...fieldMatches.keys()], fieldMatches),
    constraints: score(constraintIds, constraintMatchesById),
  };
}

/** Rules: a business rule or requirement citing the anchor screen and quoting the anchor label. */
function ruleRecords(m: Matching, rule: GtRule): EvalRecord[] {
  const route = m.screenRoute.get(rule.anchor.screen);
  const label = normalise(rule.anchor.label);
  const markers = (rule.claim_markers ?? []).map(normalise);
  return m.ofKind('business_rule', 'requirement').filter((r) => {
    if (route === undefined || !routesOf(r).has(route)) return false;
    const text = textOf(r.content).map(normalise);
    return (
      text.some((t) => t.includes(label)) &&
      (markers.length === 0 || markers.some((mk) => text.some((t) => hasMarker(t, mk))))
    );
  });
}

// Processes: a traced process covering the first and last observable routes, or a process flagged
// at a boundary / not observable, citing the first route, where the truth ends in a mutation or
// a login wall.
// Routes of every cited process or step together: a record may cite a trace's steps one by one.
function traced(r: EvalRecord, p: GtProcess): boolean {
  const seen = new Set(
    r.evidence
      .filter((e) => e.target_kind === 'process' || e.target_kind === 'process_step')
      .flatMap((e) => e.routes),
  );
  return seen.has(p.first_route) && seen.has(p.last_observable_route);
}

const flagged = (r: EvalRecord): boolean =>
  r.content.observed_extent === 'until_boundary' || r.not_observable;

function processRecords(m: Matching, p: GtProcess): EvalRecord[] {
  return m
    .ofKind('process')
    .filter(
      (r) =>
        traced(r, p) || (p.ends_with !== 'result' && flagged(r) && routesOf(r).has(p.first_route)),
    );
}

/** Terms: a glossary term with the same verbatim term. */
function termMatchesOf(m: Matching): Map<string, string[]> {
  const termMatches = new Map<string, string[]>();
  for (const t of m.gt.terms)
    termMatches.set(
      t.id,
      m
        .ofKind('glossary_term')
        .filter(
          (r) =>
            typeof r.content.term_verbatim === 'string' &&
            normalise(r.content.term_verbatim) === normalise(t.term),
        )
        .map((r) => r.key),
    );
  return termMatches;
}

/**
 * Over-claims (SC-009): what a guest cannot observe, documented as observed. A rule anchored on
 * a screen of a logged-in actor is observable to that actor's run (it is cited from that screen
 * to match at all), so it is not counted (spec 025 F-06).
 */
function overclaimsOf(m: Matching): Overclaim[] {
  const { gt } = m;
  const overclaims: Overclaim[] = [];
  const claimsObserved = (r: EvalRecord) => r.confidence === 'observed' && !r.not_observable;
  const actorScreen = (screenId: string): boolean => {
    const actor = gt.screens.find((s) => s.id === screenId)?.actor;
    return actor !== undefined && actor !== 'guest';
  };
  for (const rule of gt.rules.filter((x) => !x.guest_observable && !actorScreen(x.anchor.screen)))
    for (const r of ruleRecords(m, rule).filter(claimsObserved))
      overclaims.push({ ground_truth: rule.id, record: r.key, rev: r.rev });
  for (const p of gt.processes.filter((x) => x.ends_with === 'login_wall'))
    for (const r of processRecords(m, p).filter((x) => claimsObserved(x) && !flagged(x)))
      overclaims.push({ ground_truth: p.id, record: r.key, rev: r.rev });
  return overclaims.sort(
    (a, b) => byKey(a.ground_truth, b.ground_truth) || byKey(a.record, b.record),
  );
}

/** Obstacles: what documenting each one means depends on what MudPuppy should do with it. */
function obstacleHits(
  m: Matching,
  o: NonNullable<GroundTruth['obstacles']>[number],
  handoffs: ReadonlySet<string>,
): string[] {
  const routes = o.screens.map((id) => m.screenRoute.get(id)).filter((r) => r !== undefined);
  const markers = o.markers.map(normalise);
  const mentioning = (r: EvalRecord) =>
    markers.some((mk) => textOf(r.content).some((t) => hasMarker(normalise(t), mk)));
  if (o.expected === 'handoff')
    return routes.filter((r) => handoffs.has(r)).map((r) => `handoff:${r}`);
  if (o.expected === 'documented')
    return m.records
      .filter((r) => routes.some((rt) => routesOf(r).has(rt)) && mentioning(r))
      .map((r) => r.key);
  if (o.expected === 'navigated') return routes.flatMap((rt) => screenRecordsFor(m, rt));
  // ignored: an overlay nobody documented as a screen of its own
  return m.ofKind('screen').some(mentioning) ? [] : ['ignored'];
}

/** The v2 categories (spec 009 FR-027), only when the ground truth carries the data. */
function extraScores(
  m: Matching,
  handoffList: readonly string[],
): Partial<Record<ExtraCategory, CategoryScore>> {
  const { gt } = m;
  const out: Partial<Record<ExtraCategory, CategoryScore>> = {};
  // Logged-in screens: matched like guest screens, for screens behind a login.
  const loggedIn = gt.screens.filter((s) => s.actor !== undefined && s.actor !== 'guest');
  if (loggedIn.length > 0) {
    const hits = new Map(loggedIn.map((s) => [s.id, screenRecordsFor(m, s.route_template)]));
    out.logged_in_screens = score([...hits.keys()], hits);
  }
  if (gt.obstacles && gt.obstacles.length > 0) {
    const handoffs = new Set(handoffList);
    const hits = new Map(gt.obstacles.map((o) => [o.id, obstacleHits(m, o, handoffs)]));
    out.obstacles = score([...hits.keys()], hits);
  }
  // Entry points: an old URL documented (quoted in any record) as reaching its screen.
  if (gt.redirects && gt.redirects.length > 0) {
    const hits = new Map<string, string[]>();
    for (const d of gt.redirects) {
      const path = normalise(d.from.split('?')[0]!);
      hits.set(
        d.id,
        m.records
          .filter((r) => textOf(r.content).some((t) => normalise(t).includes(path)))
          .map((r) => r.key),
      );
    }
    out.entry_points = score([...hits.keys()], hits);
  }
  return out;
}

function failedOf(
  scores: EvaluationReport['scores'],
  thresholds: Thresholds,
  overclaims: readonly Overclaim[],
): string[] {
  const failed: string[] = [
    ...CATEGORIES.filter((c) => scores[c].pct < thresholds[c]),
    ...EXTRA_CATEGORIES.filter((c) => {
      const s = scores[c];
      return s !== undefined && s.pct < (thresholds[c] ?? EXTRA_DEFAULTS[c]);
    }),
  ];
  if (overclaims.length > thresholds.overclaims) failed.push('overclaims');
  return failed;
}

const matchesOf = <T extends { id: string }>(items: readonly T[], keys: (t: T) => string[]) =>
  new Map(items.map((t) => [t.id, keys(t)]));

/** Pure: records + ground truth + thresholds → report. Same input gives the same report. */
export function evaluate(input: EvaluateInput): EvaluationReport {
  const gt = input.groundTruth;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const records = [...input.records].sort((a, b) => byKey(a.key, b.key));
  const m: Matching = {
    gt,
    records,
    ofKind: (...kinds) => records.filter((r) => kinds.includes(r.kind)),
    screenRoute: new Map(gt.screens.map((s) => [s.id, s.route_template])),
  };
  const screenMatches = matchesOf(
    gt.screens.filter((x) => x.guest_visible),
    (s) => screenRecordsFor(m, s.route_template),
  );
  const ruleMatches = matchesOf(
    gt.rules.filter((x) => x.guest_observable),
    (rule) => ruleRecords(m, rule).map((r) => r.key),
  );
  const processMatches = matchesOf(gt.processes, (p) => processRecords(m, p).map((r) => r.key));
  const termMatches = termMatchesOf(m);
  const overclaims = overclaimsOf(m);
  const scores: EvaluationReport['scores'] = {
    screens: score([...screenMatches.keys()], screenMatches),
    ...fieldScores(m),
    rules: score([...ruleMatches.keys()], ruleMatches),
    processes: score([...processMatches.keys()], processMatches),
    terms: score([...termMatches.keys()], termMatches),
  };
  if (gt.processes.length > 0)
    scores.processes_map = processesMapScore(gt, m.ofKind('process'), processMatches);
  Object.assign(scores, extraScores(m, input.handoffs ?? []));
  const failed = failedOf(scores, thresholds, overclaims);
  return {
    portal_id: input.portal_id,
    as_of: input.as_of,
    scores,
    overclaims,
    thresholds,
    passed: failed.length === 0,
    failed,
  };
}
