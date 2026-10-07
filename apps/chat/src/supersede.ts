// Supersede amendments after a fresh run (R-30 T032, FR-021, research.md R8b). Called by the step
// recorder when a run the BA started from the chat finishes: the pure rule `amendmentImpact` decides,
// this module loads its inputs and writes the result in one transaction. Rows are never deleted.

import { readFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import { Layout, nowIso, type EvidenceStore } from '@pathfinder/core';
import {
  amendmentImpact,
  type AmendmentAnchor,
  type ObservedState,
  type Superseded,
} from '@pathfinder/workflow';

interface AnchorRow {
  id: string;
  key: string;
  anchor_fingerprint: string | null;
  anchor_route_template: string | null;
  anchor_element: string | null;
}

export interface SupersedeResult {
  runId: string;
  superseded: (Superseded & { key: string })[];
}

function elementsOf(evidence: EvidenceStore, layoutRef: string | null): ObservedState['elements'] {
  if (layoutRef === null) return [];
  try {
    const layout = Layout.parse(JSON.parse(readFileSync(evidence.resolve(layoutRef), 'utf8')));
    return layout.elements.map((e) => ({ key: e.key, role: e.role, name: e.name }));
  } catch {
    return []; // an unreadable layout cannot prove an element changed
  }
}

export function supersedeAfterRun(
  raw: BetterSqlite3.Database,
  evidence: EvidenceStore,
  portalId: string,
  runId: string,
  now: Date = new Date(),
): SupersedeResult {
  const rows = raw
    .prepare(
      `SELECT id, key, anchor_fingerprint, anchor_route_template, anchor_element FROM amendments
       WHERE portal_id = ? AND status = 'active'
         AND anchor_fingerprint IS NOT NULL AND anchor_route_template IS NOT NULL`,
    )
    .all(portalId) as AnchorRow[];
  if (rows.length === 0) return { runId, superseded: [] };

  const anchors: AmendmentAnchor[] = rows.map((r) => ({
    id: r.id,
    anchorFingerprint: r.anchor_fingerprint!,
    anchorRouteTemplate: r.anchor_route_template!,
    anchorElement:
      r.anchor_element === null
        ? null
        : (JSON.parse(r.anchor_element) as AmendmentAnchor['anchorElement']),
  }));
  const observed: ObservedState[] = (
    raw
      .prepare(
        `SELECT s.id, s.fingerprint, s.route_template, s.layout_ref
         FROM state_observations o JOIN states s ON s.id = o.state_id WHERE o.run_id = ?`,
      )
      .all(runId) as {
      id: string;
      fingerprint: string;
      route_template: string;
      layout_ref: string | null;
    }[]
  ).map((s) => ({
    stateId: s.id,
    fingerprint: s.fingerprint,
    routeTemplate: s.route_template,
    elements: elementsOf(evidence, s.layout_ref),
  }));

  const result = amendmentImpact(anchors, observed);
  const keyOf = new Map(rows.map((r) => [r.id, r.key]));
  const at = nowIso(now);
  const update = raw.prepare(
    `UPDATE amendments SET status = 'superseded', superseded_by_run = ?, superseded_reason = ?,
       superseded_detail = ?, superseded_at = ? WHERE id = ? AND status = 'active'`,
  );
  raw.transaction(() => {
    for (const s of result) update.run(runId, s.reason, s.detail, at, s.amendmentId);
  })();
  return {
    runId,
    superseded: result.map((s) => ({ ...s, key: keyOf.get(s.amendmentId) ?? s.amendmentId })),
  };
}

/** Plain-language chat notice for the BA (the chat never starts a fresh run itself). */
export function supersedeNotice(r: SupersedeResult): string | null {
  if (r.superseded.length === 0) return null;
  const lines = r.superseded.map((s) => `${s.key}: ${s.detail}`);
  return [
    `The new run changed screens that ${String(r.superseded.length)} amendment(s) were written against, so they are now superseded:`,
    ...lines,
    'Open "Superseded amendments" to re-apply or dismiss each one.',
  ].join('\n');
}
