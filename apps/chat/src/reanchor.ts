// What a finished scan does to the portal's amendments (spec 022 R4, FE-S02; replaces R-30's
// supersede step). Called by the step recorder when a scan the BA started from the chat finishes:
// the pure rule `amendmentOutcomes` decides, this module loads its inputs and writes one revision
// per affected amendment in one transaction. Amendments are carried forward to the screen's new
// revision or flagged for re-anchoring; nothing is dropped.

import { readFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import { Layout, nowIso, type EvidenceStore } from '@mudpuppy/core';
import { anchorReviewsOf, insertRef } from '@mudpuppy/store';
import {
  amendmentOutcomes,
  type AmendmentAnchor,
  type AmendmentOutcome,
  type NeedsReanchor,
  type ObservedState,
} from '@mudpuppy/workflow';
import { Amendment, AmendmentRevision } from '@mudpuppy/chat-model';
import { parseAmendment, type AmendmentRow } from './amendment-revisions.js';

interface AnchorRow {
  id: string;
  key: string;
  anchor_fingerprint: string | null;
  anchor_route_template: string | null;
  anchor_element: string | null;
  screen_id: string | null;
}

export interface ReanchorResult {
  runId: string;
  carried: (AmendmentOutcome & { key: string })[];
  needsReanchor: (AmendmentOutcome & { key: string })[];
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

function observedStates(
  raw: BetterSqlite3.Database,
  evidence: EvidenceStore,
  runId: string,
): ObservedState[] {
  const rows = raw
    .prepare(
      `SELECT s.id, s.fingerprint, s.route_template, s.layout_ref, s.screen_id
       FROM state_observations o JOIN states s ON s.id = o.state_id WHERE o.run_id = ?`,
    )
    .all(runId) as {
    id: string;
    fingerprint: string;
    route_template: string;
    layout_ref: string | null;
    screen_id: string | null;
  }[];
  return rows.map((s) => ({
    stateId: s.id,
    fingerprint: s.fingerprint,
    routeTemplate: s.route_template,
    elements: elementsOf(evidence, s.layout_ref),
    screenId: s.screen_id,
  }));
}

/** The new head for one outcome: carried forward to the successor, or waiting for a person. */
function nextHead(
  raw: BetterSqlite3.Database,
  head: Amendment,
  o: AmendmentOutcome,
  runId: string,
  at: string,
): Amendment {
  if (o.outcome === 'needs_reanchor')
    return Amendment.parse({
      ...head,
      status: 'needs_reanchor',
      superseded_by_run: runId,
      superseded_reason: o.reason === 'state_ambiguous' ? 'state_replaced' : o.reason,
      superseded_detail: o.detail,
      superseded_at: at,
      rev: head.rev + 1,
    });
  const successor = raw
    .prepare(`SELECT fingerprint, route_template, screen_id FROM states WHERE id = ?`)
    .get(o.successorStateId) as {
    fingerprint: string;
    route_template: string;
    screen_id: string | null;
  };
  const element =
    head.target_kind === 'wireframe_element' ? head.target_id.split('#').slice(1).join('#') : null;
  return Amendment.parse({
    ...head,
    target_id: element === null ? o.successorStateId : `${o.successorStateId}#${element}`,
    anchor_fingerprint: successor.fingerprint,
    anchor_route_template: successor.route_template,
    screen_id: successor.screen_id ?? head.screen_id,
    rev: head.rev + 1,
  });
}

/** The three statements that move a head to its next revision and record it. */
function headWriter(raw: BetterSqlite3.Database) {
  const load = raw.prepare(
    `SELECT * FROM amendments_with_target WHERE id = ? AND status = 'active'`,
  );
  const updateHead = raw.prepare(
    `UPDATE amendments SET status = @status, ref_id = @ref_id,
       anchor_fingerprint = @anchor_fingerprint, anchor_route_template = @anchor_route_template,
       screen_id = @screen_id, superseded_by_run = @superseded_by_run,
       superseded_reason = @superseded_reason, superseded_detail = @superseded_detail,
       superseded_at = @superseded_at, rev = @rev
     WHERE id = @id AND rev = @base_rev`,
  );
  const insertRevision = raw.prepare(
    `INSERT INTO amendment_revisions (amendment_id, rev, base_rev, change, author, status,
       ref_id, text, anchor_fingerprint, anchor_route_template, anchor_element,
       reason, run_id, created_at)
     VALUES (@amendment_id, @rev, @base_rev, @change, @author, @status, @ref_id,
       @text, @anchor_fingerprint, @anchor_route_template, @anchor_element, @reason, @run_id,
       @created_at)`,
  );
  return { load, updateHead, insertRevision };
}

/** The revision row for one outcome: who (the scan), what happened and on which base. */
function revisionOf(
  next: Amendment,
  baseRev: number,
  o: AmendmentOutcome,
  scan: { author: string; runId: string; at: string },
): AmendmentRevision {
  return AmendmentRevision.parse({
    amendment_id: next.id,
    rev: next.rev,
    base_rev: baseRev,
    change: o.outcome,
    author: scan.author,
    status: next.status,
    target_kind: next.target_kind,
    target_id: next.target_id,
    text: next.text,
    anchor_fingerprint: next.anchor_fingerprint,
    anchor_route_template: next.anchor_route_template,
    anchor_element: next.anchor_element,
    reason: o.outcome === 'needs_reanchor' ? `${o.reason}: ${o.detail}` : o.detail,
    run_id: scan.runId,
    created_at: scan.at,
  });
}

/**
 * Amendments anchored on the portal model (spec 039 § 15, T074): only a screen merged, split or
 * retired, or an element no longer seen, needs a person; another revision of the page does not.
 */
function modelReviews(
  raw: BetterSqlite3.Database,
  portalId: string,
): (NeedsReanchor & { key: string })[] {
  const keys = new Map(
    (
      raw.prepare('SELECT id, key FROM amendments WHERE portal_id = ?').all(portalId) as {
        id: string;
        key: string;
      }[]
    ).map((r) => [r.id, r.key]),
  );
  return anchorReviewsOf(raw, portalId).map((r) => ({
    amendmentId: r.id,
    outcome: 'needs_reanchor',
    reason: r.reason === 'screen_moved' ? 'state_ambiguous' : 'element_removed',
    detail: r.detail,
    successorStateId: null,
    key: keys.get(r.id) ?? r.id,
  }));
}

export function reanchorAfterRun(
  raw: BetterSqlite3.Database,
  evidence: EvidenceStore,
  portalId: string,
  runId: string,
  now: Date = new Date(),
): ReanchorResult {
  // v1 anchors (fingerprint and element): amendments the model could not anchor yet.
  const rows = raw
    .prepare(
      `SELECT id, key, anchor_fingerprint, anchor_route_template, anchor_element, screen_id
       FROM amendments
       WHERE portal_id = ? AND status = 'active' AND anchor_ref_id IS NULL
         AND anchor_fingerprint IS NOT NULL AND anchor_route_template IS NOT NULL`,
    )
    .all(portalId) as AnchorRow[];
  const modelOutcomes = modelReviews(raw, portalId);
  if (rows.length === 0 && modelOutcomes.length === 0)
    return { runId, carried: [], needsReanchor: [] };

  const anchors: AmendmentAnchor[] = rows.map((r) => ({
    id: r.id,
    anchorFingerprint: r.anchor_fingerprint!,
    anchorRouteTemplate: r.anchor_route_template!,
    anchorElement:
      r.anchor_element === null
        ? null
        : (JSON.parse(r.anchor_element) as AmendmentAnchor['anchorElement']),
    screenId: r.screen_id,
  }));
  const outcomes = [
    ...(anchors.length > 0 ? amendmentOutcomes(anchors, observedStates(raw, evidence, runId)) : []),
    ...modelOutcomes,
  ];
  const keyOf = new Map([
    ...rows.map((r): [string, string] => [r.id, r.key]),
    ...modelOutcomes.map((o): [string, string] => [o.amendmentId, o.key]),
  ]);
  const at = nowIso(now);
  const author = `scan:${runId}`;

  const write = headWriter(raw);

  raw.transaction(() => {
    for (const o of outcomes) {
      const found = write.load.get(o.amendmentId) as (AmendmentRow & { ref_id: string }) | undefined;
      if (found === undefined) continue; // changed meanwhile: leave it for the next scan
      const head = parseAmendment(found);
      const next = nextHead(raw, head, o, runId, at);
      // Carried forward to the successor state: a new target ref (spec 039 § 15, migration 0041).
      const [stateId, ...key] = next.target_id.split('#');
      const ref_id =
        next.target_id === head.target_id
          ? found.ref_id
          : insertRef(raw, 'state_id', stateId!, key.length > 0 ? key.join('#') : null);
      write.updateHead.run({ ...next, ref_id, base_rev: head.rev });
      const revision = revisionOf(next, head.rev, o, { author, runId, at });
      write.insertRevision.run({
        ...revision,
        ref_id,
        anchor_element:
          revision.anchor_element === null ? null : JSON.stringify(revision.anchor_element),
      });
    }
  })();

  const withKey = (o: AmendmentOutcome) => ({
    ...o,
    key: keyOf.get(o.amendmentId) ?? o.amendmentId,
  });
  return {
    runId,
    carried: outcomes.filter((o) => o.outcome === 'carry_forward').map(withKey),
    needsReanchor: outcomes.filter((o) => o.outcome === 'needs_reanchor').map(withKey),
  };
}

/** Plain-language chat notice for the BA (the chat never starts a fresh scan itself). */
export function reanchorNotice(r: ReanchorResult): string | null {
  const lines: string[] = [];
  if (r.carried.length > 0)
    lines.push(
      `${String(r.carried.length)} amendment(s) moved to the new revision of their screen: ${r.carried.map((c) => c.key).join(', ')}.`,
    );
  if (r.needsReanchor.length > 0)
    lines.push(
      `The new scan changed screens that ${String(r.needsReanchor.length)} amendment(s) were written against, and their anchor is gone, so they need re-anchoring:`,
      ...r.needsReanchor.map((s) => `${s.key}: ${s.detail}`),
      'Open Review to pick the new anchor or dismiss each one. Nothing was deleted.',
    );
  return lines.length === 0 ? null : lines.join('\n');
}
