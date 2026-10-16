// Documentation quality flags (spec 030 R-65, owner question D-4: flag, do not fail). From the field
// (GC-21, SQ-6, SQ-2): use cases citing one screen region for many steps (the pages looked empty
// though the evidence was there), screens documented with no requirement or rule at all, and two
// screen records for one route template ("one screen twice"). `docs:audit` prints them apart from
// its integrity findings; they never make the audit fail.

import type { DocKind } from '@pathfinder/docs-model';

export type QualityCheck = 'steps_uncited' | 'no_requirements' | 'duplicate_screen_route';

export interface QualityFinding {
  check: QualityCheck;
  portal_id: string;
  /** The record concerned, or null for a finding about the portal's documentation as a whole. */
  key: string | null;
  detail: string;
}

interface RawDb {
  prepare(sql: string): { all(...p: unknown[]): unknown[] };
}

interface LatestRow {
  portal_id: string;
  kind: DocKind;
  key: string;
  revision_id: string;
  content_json: string;
}

const flowSteps = (content: {
  main_flow?: unknown[];
  alternate_flows?: unknown[][];
  exception_flows?: unknown[][];
}): number =>
  (content.main_flow?.length ?? 0) +
  (content.alternate_flows ?? []).reduce((n, f) => n + f.length, 0) +
  (content.exception_flows ?? []).reduce((n, f) => n + f.length, 0);

export function qualityFindings(raw: RawDb, portalId?: string): QualityFinding[] {
  const latest = raw
    .prepare(
      `SELECT r.portal_id, r.kind, r.key, v.id AS revision_id, v.content_json
         FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
        WHERE r.withdrawn = 0 AND (? IS NULL OR r.portal_id = ?)
        ORDER BY r.portal_id, r.kind, r.seq`,
    )
    .all(portalId ?? null, portalId ?? null) as LatestRow[];
  const regions = raw.prepare(
    `SELECT count(DISTINCT target_id || '#' || coalesce(region, '')) AS n FROM doc_evidence_links
      WHERE revision_id = ? AND target_kind = 'screen_region'`,
  );
  const out: QualityFinding[] = [];
  const byPortal = new Map<string, LatestRow[]>();
  for (const row of latest)
    byPortal.set(row.portal_id, [...(byPortal.get(row.portal_id) ?? []), row]);

  for (const [portal, rows] of byPortal) {
    for (const uc of rows.filter((r) => r.kind === 'use_case')) {
      const steps = flowSteps(JSON.parse(uc.content_json) as Parameters<typeof flowSteps>[0]);
      const cited = (regions.all(uc.revision_id)[0] as { n: number }).n;
      if (steps > 1 && cited < steps)
        out.push({
          check: 'steps_uncited',
          portal_id: portal,
          key: uc.key,
          detail: `${String(steps)} flow steps, ${String(cited)} screen region(s) cited: cite one per step and per variant state`,
        });
    }
    const screens = rows.filter((r) => r.kind === 'screen');
    if (
      screens.length > 0 &&
      !rows.some((r) => r.kind === 'requirement' || r.kind === 'business_rule')
    )
      out.push({
        check: 'no_requirements',
        portal_id: portal,
        key: null,
        detail: `${String(screens.length)} screen(s) documented, no requirement and no business rule`,
      });
    const seen = new Map<string, string>();
    for (const s of screens)
      for (const route of (JSON.parse(s.content_json) as { route_templates?: string[] })
        .route_templates ?? []) {
        const first = seen.get(route);
        if (first !== undefined)
          out.push({
            check: 'duplicate_screen_route',
            portal_id: portal,
            key: s.key,
            detail: `route template ${route} is also documented by ${first}`,
          });
        else seen.set(route, s.key);
      }
  }
  return out;
}
