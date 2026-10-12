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
 */
import type { GroundTruth } from '@pathfinder/docs';
import type { RawDb } from '../../queries.js';

export interface BaShapes {
  route_templates_with_query: number;
  data_items_joined: number;
  rules_on_screens_pct: number;
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
  };
}
