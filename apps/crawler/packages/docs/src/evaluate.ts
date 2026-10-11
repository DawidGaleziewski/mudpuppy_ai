import type { Confidence } from '@pathfinder/core';
import type { DocKind, EvidenceTargetKind } from '@pathfinder/docs-model';
import { z } from 'zod';
import type { RawDb } from './keys.js';
import { canonical } from './render/records-json.js';

/**
 * Goal evaluation (`docs:evaluate`, research §16, contracts/ground-truth.md; FR-063, FR-064, SC-008,
 * SC-009): how much of a portal's ground truth the documentation covers, what is missing, and where
 * it claims more certainty than a guest could have. Deterministic matching, no LLM judge.
 *
 * The ground truth type is declared here, generically, so this module never imports a test portal;
 * fields it does not score are accepted and ignored.
 */

// ---- ground truth ---------------------------------------------------------------------------------

const Id = z.string().min(1);
const Value = z.union([z.number(), z.string()]);

export const GroundTruth = z.object({
  portal_id: z.string().min(1),
  screens: z.array(
    z.object({
      id: Id,
      route_template: z.string().min(1),
      guest_visible: z.boolean(),
      /** v2 (spec 009): `guest` or a test user id; a non-guest screen scores in `logged_in_screens`. */
      actor: z.string().optional(),
    }),
  ),
  forms: z.array(
    z.object({
      id: Id,
      screen: Id,
      fields: z.array(
        z.object({
          id: Id,
          label: z.string().min(1),
          constraints: z
            .object({
              required: z.boolean().optional(),
              min: Value.optional(),
              max: Value.optional(),
              pattern: z.string().optional(),
              max_length: z.number().optional(),
              allowed_values: z.array(z.string()).optional(),
            })
            .default({}),
        }),
      ),
    }),
  ),
  rules: z.array(
    z.object({
      id: Id,
      /** Not scored here; the text a model-based grader judges a record against (spec 017). */
      statement: z.string().min(1).optional(),
      anchor: z.object({ screen: Id, label: z.string().min(1) }),
      guest_observable: z.boolean(),
      /** When present, a matching record must also contain one of these phrases. */
      claim_markers: z.array(z.string().min(1)).optional(),
    }),
  ),
  processes: z.array(
    z.object({
      id: Id,
      first_route: z.string().min(1),
      last_observable_route: z.string().min(1),
      ends_with: z.enum(['mutation', 'result', 'login_wall']),
      /** The routes in order; not scored here, kept for the eval's trace grader (R-46). */
      steps: z.array(z.string().min(1)).optional(),
    }),
  ),
  terms: z.array(
    z.object({
      id: Id,
      term: z.string().min(1),
      /** Not scored here; what the glossary judge compares a definition with (spec 017). */
      meaning: z.string().min(1).optional(),
    }),
  ),
  // v2 (spec 009 contracts/ground-truth-v2.md); absent in v1 files, which then score as before.
  redirects: z
    .array(z.object({ id: Id, from: z.string().min(1), to: z.string().min(1) }))
    .optional(),
  obstacles: z
    .array(
      z.object({
        id: Id,
        screens: z.array(Id),
        markers: z.array(z.string().min(1)),
        expected: z.enum(['handoff', 'documented', 'ignored', 'navigated']),
      }),
    )
    .optional(),
});
export type GroundTruth = z.infer<typeof GroundTruth>;

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
 * Categories a v2 ground truth adds (spec 009 FR-027). They are scored, and appear in the report,
 * only when the ground truth has the data, so v1 reports stay byte-identical.
 */
export const EXTRA_CATEGORIES = ['logged_in_screens', 'obstacles', 'entry_points'] as const;
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

/** Pure: records + ground truth + thresholds → report. Same input gives the same report. */
export function evaluate(input: EvaluateInput): EvaluationReport {
  const gt = input.groundTruth;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const records = [...input.records].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const ofKind = (...kinds: DocKind[]) => records.filter((r) => kinds.includes(r.kind));
  const screenRoute = new Map(gt.screens.map((s) => [s.id, s.route_template]));
  const guestScreens = new Set(gt.screens.filter((s) => s.guest_visible).map((s) => s.id));

  // Screens: a screen record listing the route template.
  const screenMatches = new Map<string, string[]>();
  for (const s of gt.screens.filter((x) => x.guest_visible))
    screenMatches.set(
      s.id,
      ofKind('screen')
        .filter((r) => strings(r.content.route_templates).includes(s.route_template))
        .map((r) => r.key),
    );

  // Fields and constraints: a data item with the field's verbatim label.
  const fieldMatches = new Map<string, string[]>();
  const constraintMatchesById = new Map<string, string[]>();
  const constraintIds: string[] = [];
  const guestFields = gt.forms.filter((f) => guestScreens.has(f.screen)).flatMap((f) => f.fields);
  for (const field of guestFields) {
    const items = ofKind('data_item').filter(
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

  // Rules: a business rule or requirement citing the anchor screen and quoting the anchor label.
  const ruleRecords = (rule: GroundTruth['rules'][number]): EvalRecord[] => {
    const route = screenRoute.get(rule.anchor.screen);
    const label = normalise(rule.anchor.label);
    const markers = (rule.claim_markers ?? []).map(normalise);
    return ofKind('business_rule', 'requirement').filter((r) => {
      if (route === undefined || !routesOf(r).has(route)) return false;
      const text = textOf(r.content).map(normalise);
      return (
        text.some((t) => t.includes(label)) &&
        (markers.length === 0 || markers.some((m) => text.some((t) => hasMarker(t, m))))
      );
    });
  };
  const ruleMatches = new Map<string, string[]>();
  for (const rule of gt.rules.filter((x) => x.guest_observable))
    ruleMatches.set(
      rule.id,
      ruleRecords(rule).map((r) => r.key),
    );

  // Processes: a traced process covering the first and last observable routes, or a process flagged
  // at a boundary / not observable, citing the first route, where the truth ends in a mutation or
  // a login wall.
  // Routes of every cited process or step together: a record may cite a trace's steps one by one.
  const traced = (r: EvalRecord, p: GroundTruth['processes'][number]): boolean => {
    const seen = new Set(
      r.evidence
        .filter((e) => e.target_kind === 'process' || e.target_kind === 'process_step')
        .flatMap((e) => e.routes),
    );
    return seen.has(p.first_route) && seen.has(p.last_observable_route);
  };
  const flagged = (r: EvalRecord): boolean =>
    r.content.observed_extent === 'until_boundary' || r.not_observable;
  const processRecords = (p: GroundTruth['processes'][number]): EvalRecord[] =>
    ofKind('process').filter(
      (r) =>
        traced(r, p) || (p.ends_with !== 'result' && flagged(r) && routesOf(r).has(p.first_route)),
    );
  const processMatches = new Map<string, string[]>();
  for (const p of gt.processes)
    processMatches.set(
      p.id,
      processRecords(p).map((r) => r.key),
    );

  // Terms: a glossary term with the same verbatim term.
  const termMatches = new Map<string, string[]>();
  for (const t of gt.terms)
    termMatches.set(
      t.id,
      ofKind('glossary_term')
        .filter(
          (r) =>
            typeof r.content.term_verbatim === 'string' &&
            normalise(r.content.term_verbatim) === normalise(t.term),
        )
        .map((r) => r.key),
    );

  // Over-claims (SC-009): what a guest cannot observe, documented as observed.
  const overclaims: Overclaim[] = [];
  const claimsObserved = (r: EvalRecord) => r.confidence === 'observed' && !r.not_observable;
  for (const rule of gt.rules.filter((x) => !x.guest_observable))
    for (const r of ruleRecords(rule).filter(claimsObserved))
      overclaims.push({ ground_truth: rule.id, record: r.key, rev: r.rev });
  for (const p of gt.processes.filter((x) => x.ends_with === 'login_wall'))
    for (const r of processRecords(p).filter((x) => claimsObserved(x) && !flagged(x)))
      overclaims.push({ ground_truth: p.id, record: r.key, rev: r.rev });
  overclaims.sort((a, b) =>
    a.ground_truth !== b.ground_truth
      ? a.ground_truth < b.ground_truth
        ? -1
        : 1
      : a.record < b.record
        ? -1
        : a.record > b.record
          ? 1
          : 0,
  );

  const scores: EvaluationReport['scores'] = {
    screens: score([...screenMatches.keys()], screenMatches),
    fields: score([...fieldMatches.keys()], fieldMatches),
    constraints: score(constraintIds, constraintMatchesById),
    rules: score([...ruleMatches.keys()], ruleMatches),
    processes: score([...processMatches.keys()], processMatches),
    terms: score([...termMatches.keys()], termMatches),
  };

  // ---- v2 categories (spec 009 FR-027), only when the ground truth carries the data -------------
  const screenRecordFor = (route: string): string[] =>
    ofKind('screen')
      .filter((r) => strings(r.content.route_templates).includes(route))
      .map((r) => r.key);

  // Logged-in screens: matched like guest screens, for screens behind a login.
  const loggedIn = gt.screens.filter((s) => s.actor !== undefined && s.actor !== 'guest');
  if (loggedIn.length > 0) {
    const m = new Map(loggedIn.map((s) => [s.id, screenRecordFor(s.route_template)]));
    scores.logged_in_screens = score([...m.keys()], m);
  }

  // Obstacles: what documenting each one means depends on what Pathfinder should do with it.
  if (gt.obstacles && gt.obstacles.length > 0) {
    const handoffs = new Set(input.handoffs ?? []);
    const m = new Map<string, string[]>();
    for (const o of gt.obstacles) {
      const routes = o.screens.map((id) => screenRoute.get(id)).filter((r) => r !== undefined);
      const markers = o.markers.map(normalise);
      const mentioning = (r: EvalRecord) =>
        markers.some((mk) => textOf(r.content).some((t) => hasMarker(normalise(t), mk)));
      let hits: string[] = [];
      if (o.expected === 'handoff')
        hits = routes.filter((r) => handoffs.has(r)).map((r) => `handoff:${r}`);
      else if (o.expected === 'documented')
        hits = records
          .filter((r) => routes.some((rt) => routesOf(r).has(rt)) && mentioning(r))
          .map((r) => r.key);
      else if (o.expected === 'navigated') hits = routes.flatMap((rt) => screenRecordFor(rt));
      // ignored: an overlay nobody documented as a screen of its own
      else if (!ofKind('screen').some(mentioning)) hits = ['ignored'];
      m.set(o.id, hits);
    }
    scores.obstacles = score([...m.keys()], m);
  }

  // Entry points: an old URL documented (quoted in any record) as reaching its screen.
  if (gt.redirects && gt.redirects.length > 0) {
    const m = new Map<string, string[]>();
    for (const d of gt.redirects) {
      const path = normalise(d.from.split('?')[0]!);
      m.set(
        d.id,
        records
          .filter((r) => textOf(r.content).some((t) => normalise(t).includes(path)))
          .map((r) => r.key),
      );
    }
    scores.entry_points = score([...m.keys()], m);
  }

  const failed: string[] = [
    ...CATEGORIES.filter((c) => scores[c].pct < thresholds[c]),
    ...EXTRA_CATEGORIES.filter((c) => {
      const s = scores[c];
      return s !== undefined && s.pct < (thresholds[c] ?? EXTRA_DEFAULTS[c]);
    }),
  ];
  if (overclaims.length > thresholds.overclaims) failed.push('overclaims');
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

/** The categories a report scored: the six v1 ones, then any v2 one the ground truth had. */
export const scoredCategories = (report: EvaluationReport): AnyCategory[] => [
  ...CATEGORIES,
  ...EXTRA_CATEGORIES.filter((c) => report.scores[c] !== undefined),
];

export const minimumOf = (t: Thresholds, c: AnyCategory): number =>
  (t as Partial<Record<AnyCategory, number>>)[c] ?? EXTRA_DEFAULTS[c as ExtraCategory] ?? 0;

/** Canonical, byte-stable JSON (sorted keys, two-space indent, LF, one trailing newline). */
export const reportJson = (report: EvaluationReport): string =>
  `${JSON.stringify(canonical(report), null, 2)}\n`;

/** What a ground-truth id stands for, for the Markdown summary. */
function describe(gt: GroundTruth): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of gt.screens) out.set(s.id, `screen \`${s.route_template}\``);
  for (const f of gt.forms)
    for (const field of f.fields) {
      out.set(field.id, `field "${field.label}"`);
      for (const [kind, value] of Object.entries(field.constraints))
        out.set(
          `${field.id}.${kind}`,
          `"${field.label}" ${kind.replace(/_/g, ' ')} = ${JSON.stringify(value)}`,
        );
    }
  const route = new Map(gt.screens.map((s) => [s.id, s.route_template]));
  for (const r of gt.rules)
    out.set(
      r.id,
      `rule at "${r.anchor.label}" on \`${route.get(r.anchor.screen) ?? r.anchor.screen}\``,
    );
  for (const p of gt.processes)
    out.set(
      p.id,
      `process \`${p.first_route}\` → \`${p.last_observable_route}\` (ends: ${p.ends_with.replace(/_/g, ' ')})`,
    );
  for (const t of gt.terms) out.set(t.id, `term "${t.term}"`);
  return out;
}

/** Markdown summary written next to the JSON report: scores, every miss, every over-claim. */
export function evaluationMarkdown(report: EvaluationReport, gt: GroundTruth): string {
  const what = describe(gt);
  const lines = [
    `# Documentation evaluation: ${report.portal_id}`,
    '',
    `- **As of:** ${report.as_of || 'no revisions'}`,
    `- **Result:** ${report.passed ? 'passed' : `failed (${report.failed.join(', ')})`}`,
    '',
    '| Category | Matched | Total | Score | Minimum | Result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...scoredCategories(report).map((c) => {
      const s = report.scores[c]!;
      const min = minimumOf(report.thresholds, c);
      return `| ${c} | ${s.matched} | ${s.total} | ${s.pct.toFixed(1)}% | ${min}% | ${s.pct >= min ? 'ok' : '**below**'} |`;
    }),
    `| over-claims | ${report.overclaims.length} | | | at most ${report.thresholds.overclaims} | ${report.overclaims.length <= report.thresholds.overclaims ? 'ok' : '**too many**'} |`,
    '',
    '## Missing',
  ];
  for (const c of scoredCategories(report)) {
    const missing = report.scores[c]!.missing;
    if (missing.length === 0) continue;
    lines.push('', `### ${c}`, '', ...missing.map((id) => `- ${id}: ${what.get(id) ?? id}`));
  }
  if (scoredCategories(report).every((c) => report.scores[c]!.missing.length === 0))
    lines.push('', '_nothing_');
  lines.push(
    '',
    '## Over-claims',
    '',
    ...(report.overclaims.length === 0
      ? ['_none_']
      : report.overclaims.map(
          (o) =>
            `- ${o.record} rev ${o.rev} documents ${o.ground_truth} (${what.get(o.ground_truth) ?? ''}) as observed`,
        )),
  );
  return `${lines.join('\n')}\n`;
}

// ---- store → input ----------------------------------------------------------------------------------

interface RevisionRow {
  record_id: string;
  key: string;
  kind: DocKind;
  revision_id: string;
  rev_no: number;
  confidence: Confidence;
  not_observable: 0 | 1;
  content_json: string;
}

/**
 * Read the evaluator input from the store: per non-withdrawn record its latest revision that is not
 * rejected, with every evidence link resolved to the route templates it was seen on.
 */
export function loadEvalInput(
  raw: RawDb,
  portalId: string,
): { as_of: string; records: EvalRecord[]; handoffs: string[] } {
  const rows = raw
    .prepare(
      `SELECT r.id AS record_id, r.key, r.kind, v.id AS revision_id, v.rev_no, v.confidence,
              v.not_observable, v.content_json
       FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id
       WHERE r.portal_id = ? AND r.withdrawn = 0 AND v.status <> 'rejected'
       ORDER BY r.key, v.rev_no`,
    )
    .all(portalId) as RevisionRow[];
  const latest = new Map<string, RevisionRow>();
  for (const row of rows) latest.set(row.record_id, row); // ordered by rev_no: the last one wins

  const stateRoute = (id: string | null): string[] => {
    if (!id) return [];
    const row = raw.prepare('SELECT route_template FROM states WHERE id = ?').get(id) as
      { route_template: string } | undefined;
    return row ? [row.route_template] : [];
  };
  const one = (sql: string, id: string): Record<string, string | null> | undefined =>
    raw.prepare(sql).get(id) as Record<string, string | null> | undefined;
  const routesFor = (kind: EvidenceTargetKind, id: string): string[] => {
    switch (kind) {
      case 'state':
        return stateRoute(id);
      case 'form':
      case 'action':
        return stateRoute(
          one(`SELECT state_id FROM ${kind === 'form' ? 'forms' : 'actions'} WHERE id = ?`, id)
            ?.state_id ?? null,
        );
      case 'edge': {
        const e = one('SELECT from_state, to_state FROM edges WHERE id = ?', id);
        return e ? [...stateRoute(e.from_state ?? null), ...stateRoute(e.to_state ?? null)] : [];
      }
      case 'network_call': {
        const e = one(
          'SELECT e.from_state, e.to_state FROM network_calls n JOIN edges e ON e.id = n.edge_id WHERE n.id = ?',
          id,
        );
        return e ? [...stateRoute(e.from_state ?? null), ...stateRoute(e.to_state ?? null)] : [];
      }
      case 'rule_candidate':
      case 'open_question':
        return stateRoute(
          one(
            `SELECT about_ref FROM ${kind === 'rule_candidate' ? 'rule_candidates' : 'open_questions'} WHERE id = ?`,
            id,
          )?.about_ref ?? null,
        );
      case 'process': {
        const steps = raw
          .prepare(
            'SELECT state_before, state_after FROM process_steps WHERE process_id = ? ORDER BY ord',
          )
          .all(id) as { state_before: string | null; state_after: string | null }[];
        return steps.flatMap((s) => [...stateRoute(s.state_before), ...stateRoute(s.state_after)]);
      }
      case 'process_step': {
        const s = one('SELECT state_before, state_after FROM process_steps WHERE id = ?', id);
        return s
          ? [...stateRoute(s.state_before ?? null), ...stateRoute(s.state_after ?? null)]
          : [];
      }
      default:
        return [];
    }
  };

  const records: EvalRecord[] = [];
  for (const row of latest.values()) {
    const links = raw
      .prepare(
        'SELECT target_kind, target_id FROM doc_evidence_links WHERE revision_id = ? ORDER BY target_kind, target_id, id',
      )
      .all(row.revision_id) as { target_kind: EvidenceTargetKind; target_id: string }[];
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(row.content_json) as Record<string, unknown>;
    } catch {
      // A malformed revision scores nothing; docs:audit reports it.
    }
    records.push({
      key: row.key,
      kind: row.kind,
      rev: row.rev_no,
      confidence: row.confidence,
      not_observable: row.not_observable === 1,
      content,
      evidence: links.map((l) => ({
        ...l,
        routes: [...new Set(routesFor(l.target_kind, l.target_id))].sort(),
      })),
    });
  }
  const asOf = raw
    .prepare(
      `SELECT max(t) AS t FROM (
         SELECT v.created_at AS t FROM doc_revisions v JOIN doc_records r ON r.id = v.record_id WHERE r.portal_id = ?
         UNION ALL
         SELECT rv.created_at FROM doc_reviews rv JOIN doc_revisions v ON v.id = rv.revision_id
         JOIN doc_records r ON r.id = v.record_id WHERE r.portal_id = ?)`,
    )
    .get(portalId, portalId) as { t: string | null };
  // Hand-offs (spec 009 FR-022): the crawler's "Human needed: CAPTCHA on …" questions, by route.
  const handoffs = (
    raw
      .prepare(
        `SELECT DISTINCT s.route_template AS route FROM open_questions q
         JOIN runs ru ON ru.id = q.run_id JOIN states s ON s.id = q.about_ref
         WHERE ru.portal_id = ? AND q.text LIKE 'Human needed: CAPTCHA on %'
         ORDER BY route`,
      )
      .all(portalId) as { route: string }[]
  ).map((r) => r.route);
  return { as_of: asOf.t ?? '', records, handoffs };
}
