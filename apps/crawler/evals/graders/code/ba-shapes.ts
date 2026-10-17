/**
 * The shape mistakes the spec 019 trials caught in the BA's records, counted so the next trials show
 * whether they are gone (F-09, F-13, F-14). Diagnostics, not goal scores: a code grader over the
 * latest revision of each record, no model, no tokens.
 *
 * - `route_templates_with_query`: screen records whose route template carries a query
 *   (`/porownanie/wynik?produkt_1={code}`); the template must be the recorded path.
 * - `data_items_joined`: data items whose verbatim name holds two or more ground-truth field labels
 *   ("Imię, Temat, Wiadomość"); one data item per field.
 * - `rules_on_screens_pct`: business rules linked to a screen with `applies_on`, of all rules.
 * - `data_items_code_names`: data items named by the input's code name (`rok_produkcji`,
 *   `postalCode`) instead of its visible label (spec 026 F-05, spec 031 T016).
 * - `error_pages_as_steps`: steps of the processes' as-is (variant A, latest revision) on a state of
 *   kind `technical`, or on one the owner confirmed as `temporary` or `technical` in Review: an
 *   error page is never a step (spec 033 SC-007, design §7.5). Must be 0.
 */
import type { GroundTruth } from '@pathfinder/docs';
import type { RawDb } from '../../queries.js';

export interface BaShapes {
  route_templates_with_query: number;
  data_items_joined: number;
  rules_on_screens_pct: number;
  data_items_code_names: number;
  error_pages_as_steps: number;
}

const ERROR_VERDICTS = new Set(['temporary', 'technical']);

/** States the owner confirmed as an error or a temporary state (spec 033); none on an old store. */
function confirmedErrors(db: RawDb, portal: string): Set<string> {
  try {
    const rows = db
      .prepare(
        "SELECT confirmed_json FROM reconciliations WHERE portal_id = ? AND status = 'confirmed'",
      )
      .all(portal) as { confirmed_json: string }[];
    return new Set(
      rows.flatMap((r) =>
        (JSON.parse(r.confirmed_json) as { state_id: string; verdict: string }[])
          .filter((v) => ERROR_VERDICTS.has(v.verdict))
          .map((v) => v.state_id),
      ),
    );
  } catch {
    return new Set();
  }
}

/** Steps of the processes' as-is on an error page (see the module comment). */
export function errorPagesAsSteps(db: RawDb, portal: string): number {
  const technical = new Set(
    (
      db
        .prepare("SELECT id FROM states WHERE portal_id = ? AND state_kind = 'technical'")
        .all(portal) as { id: string }[]
    ).map((r) => r.id),
  );
  const errors = new Set([...technical, ...confirmedErrors(db, portal)]);
  const steps = db
    .prepare(
      `SELECT r.steps FROM ba_processes p
         JOIN process_variants v ON v.process_id = p.id AND v.label = 'A'
         JOIN process_variant_revisions r ON r.variant_id = v.id AND r.rev = v.rev
        WHERE p.portal_id = ?`,
    )
    .all(portal) as { steps: string }[];
  return steps
    .flatMap((s) => JSON.parse(s.steps) as { state_id: string | null }[])
    .filter((s) => s.state_id !== null && errors.has(s.state_id)).length;
}

/**
 * A name that reads like code, not a label: snake_case or camelCase, no spaces, and not one of the
 * ground-truth labels (a label may itself be one word).
 */
export function isCodeName(name: string, labels: readonly string[]): boolean {
  const n = name.trim();
  if (labels.some((l) => norm(l) === norm(n))) return false;
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/i.test(n) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(n);
}

type Latest = { kind: string; key: string; content_json: string };

const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Ground-truth field labels a data item's verbatim name contains. */
export function labelsIn(name: string, labels: readonly string[]): string[] {
  const n = norm(name);
  return labels.filter((l) => n.includes(norm(l)));
}

export function scoreBaShapes(db: RawDb, portal: string, gt: GroundTruth): BaShapes {
  const latest = db
    .prepare(
      `SELECT r.kind, r.key, v.content_json FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.portal_id = ? AND r.withdrawn = 0`,
    )
    .all(portal) as Latest[];
  const content = (r: Latest) => JSON.parse(r.content_json) as Record<string, unknown>;
  const screens = latest.filter((r) => r.kind === 'screen');
  const routeTemplatesWithQuery = screens.filter((r) => {
    const t = content(r).route_templates;
    return Array.isArray(t) && t.some((x) => String(x).includes('?'));
  }).length;
  const labels = gt.forms.flatMap((f) => f.fields.map((x) => x.label));
  const dataItemsJoined = latest.filter(
    (r) => r.kind === 'data_item' && labelsIn(asText(content(r).name_verbatim), labels).length >= 2,
  ).length;
  const rules = latest.filter((r) => r.kind === 'business_rule');
  const onScreens = db
    .prepare(
      `SELECT COUNT(DISTINCT fr.key) AS n FROM doc_relations rel
       JOIN doc_revisions v ON v.id = rel.from_revision_id
       JOIN doc_records fr ON fr.id = v.record_id AND v.rev_no = fr.latest_rev
       WHERE fr.portal_id = ? AND fr.kind = 'business_rule' AND rel.type = 'applies_on'`,
    )
    .get(portal) as { n: number };
  return {
    route_templates_with_query: routeTemplatesWithQuery,
    data_items_joined: dataItemsJoined,
    rules_on_screens_pct: rules.length === 0 ? 0 : Math.round((onScreens.n / rules.length) * 100),
    data_items_code_names: latest.filter(
      (r) => r.kind === 'data_item' && isCodeName(asText(content(r).name_verbatim), labels),
    ).length,
    error_pages_as_steps: errorPagesAsSteps(db, portal),
  };
}
