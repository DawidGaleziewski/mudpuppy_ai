// What a finished scan does to the portal's amendments (spec 022 R4, FE-S02; replaces R-30's
// supersede step). Called by the step recorder when a scan the BA started from the chat finishes:
// the pure rule `amendmentOutcomes` decides, this module loads its inputs and writes one revision
// per affected amendment in one transaction. Amendments are carried forward to the screen's new
// revision or flagged for re-anchoring; nothing is dropped.

import { readFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import { Layout, nowIso, type EvidenceStore } from '@pathfinder/core';
import {
  amendmentOutcomes,
  type AmendmentAnchor,
  type AmendmentOutcome,
  type ObservedState,
} from '@pathfinder/workflow';
import { Amendment, AmendmentRevision } from '@pathfinder/chat-model';

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

export function reanchorAfterRun(
  raw: BetterSqlite3.Database,
  evidence: EvidenceStore,
  portalId: string,
  runId: string,
  now: Date = new Date(),
): ReanchorResult {
  const rows = raw
    .prepare(
      `SELECT id, key, anchor_fingerprint, anchor_route_template, anchor_element, screen_id
       FROM amendments
       WHERE portal_id = ? AND status = 'active'
         AND anchor_fingerprint IS NOT NULL AND anchor_route_template IS NOT NULL`,
    )
    .all(portalId) as AnchorRow[];
  if (rows.length === 0) return { runId, carried: [], needsReanchor: [] };

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
  const outcomes = amendmentOutcomes(anchors, observedStates(raw, evidence, runId));
  const keyOf = new Map(rows.map((r) => [r.id, r.key]));
  const at = nowIso(now);
  const author = `scan:${runId}`;

  const loadHead = raw.prepare(`SELECT * FROM amendments WHERE id = ? AND status = 'active'`);
  const updateHead = raw.prepare(
    `UPDATE amendments SET status = @status, target_id = @target_id,
       anchor_fingerprint = @anchor_fingerprint, anchor_route_template = @anchor_route_template,
       screen_id = @screen_id, superseded_by_run = @superseded_by_run,
       superseded_reason = @superseded_reason, superseded_detail = @superseded_detail,
       superseded_at = @superseded_at, rev = @rev
     WHERE id = @id AND rev = @base_rev`,
  );
  const insertRevision = raw.prepare(
    `INSERT INTO amendment_revisions (amendment_id, rev, base_rev, change, author, status,
       target_kind, target_id, text, anchor_fingerprint, anchor_route_template, anchor_element,
       reason, run_id, created_at)
     VALUES (@amendment_id, @rev, @base_rev, @change, @author, @status, @target_kind, @target_id,
       @text, @anchor_fingerprint, @anchor_route_template, @anchor_element, @reason, @run_id,
       @created_at)`,
  );

  raw.transaction(() => {
    for (const o of outcomes) {
      const found = loadHead.get(o.amendmentId) as Record<string, unknown> | undefined;
      if (found === undefined) continue; // changed meanwhile: leave it for the next scan
      const head = Amendment.parse({
        ...found,
        anchor_element:
          found.anchor_element === null ? null : JSON.parse(String(found.anchor_element)),
      });
      const next = nextHead(raw, head, o, runId, at);
      updateHead.run({ ...next, base_rev: head.rev });
      const revision = AmendmentRevision.parse({
        amendment_id: next.id,
        rev: next.rev,
        base_rev: head.rev,
        change: o.outcome,
        author,
        status: next.status,
        target_kind: next.target_kind,
        target_id: next.target_id,
        text: next.text,
        anchor_fingerprint: next.anchor_fingerprint,
        anchor_route_template: next.anchor_route_template,
        anchor_element: next.anchor_element,
        reason: o.outcome === 'needs_reanchor' ? `${o.reason}: ${o.detail}` : o.detail,
        run_id: runId,
        created_at: at,
      });
      insertRevision.run({
        ...revision,
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
