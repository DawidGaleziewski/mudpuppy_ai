import type { Confidence, EvidenceTargetKind } from '@pathfinder/core';
import { DocsError } from './errors.js';
import type { RawDb } from './keys.js';
import type { ResolvedTarget } from './observed-rule.js';

/** An evidence link as a writer states it; the server resolves the run. */
export interface EvidenceLinkInput {
  target_kind: EvidenceTargetKind;
  /** Row id; a `doc_record` may also be named by its key. */
  target_id: string;
  /** Only for `state`: which run's observation of the state is meant. */
  run_id?: string | undefined;
}

/**
 * Run-bound Layer A tables whose rows carry their own `run_id`. `confidence` is the column to read,
 * or the fixed value where the table has none: actions and network calls are recorded by the server
 * as it sees them (observed); crawler questions and decisions say nothing about the portal's behaviour.
 */
const RUN_BOUND: Partial<
  Record<EvidenceTargetKind, { table: string; confidence: 'column' | Confidence | null }>
> = {
  edge: { table: 'edges', confidence: 'column' },
  form: { table: 'forms', confidence: 'column' },
  action: { table: 'actions', confidence: 'observed' },
  network_call: { table: 'network_calls', confidence: 'observed' },
  rule_candidate: { table: 'rule_candidates', confidence: 'column' },
  open_question: { table: 'open_questions', confidence: null },
  decision: { table: 'decision_log', confidence: null },
};

function runPortal(raw: RawDb, runId: string): string | undefined {
  return (
    raw.prepare('SELECT portal_id FROM runs WHERE id = ?').get(runId) as
      { portal_id: string } | undefined
  )?.portal_id;
}

/**
 * Resolve one link to its row, portal and run **without** judging it: used by the audit, which
 * reports what it finds. Returns null when the target does not exist (or its kind cannot be resolved
 * yet: `process`, `process_step` arrive with trace mode).
 */
export function lookupTarget(raw: RawDb, link: EvidenceLinkInput): ResolvedTarget | null {
  const { target_kind: kind, target_id: id } = link;

  if (kind === 'state') {
    const state = raw
      .prepare('SELECT portal_id, confidence, first_seen_run FROM states WHERE id = ?')
      .get(id) as { portal_id: string; confidence: Confidence; first_seen_run: string } | undefined;
    if (!state) return null;
    return {
      target_kind: kind,
      target_id: id,
      run_id: link.run_id ?? null,
      portal_id: state.portal_id,
      confidence: state.confidence,
    };
  }

  const bound = RUN_BOUND[kind];
  if (bound) {
    const select = bound.confidence === 'column' ? 'run_id, confidence' : 'run_id';
    const row = raw.prepare(`SELECT ${select} FROM ${bound.table} WHERE id = ?`).get(id) as
      { run_id: string; confidence?: Confidence } | undefined;
    if (!row) return null;
    const portal = runPortal(raw, row.run_id);
    if (portal === undefined) return null;
    return {
      target_kind: kind,
      target_id: id,
      run_id: row.run_id,
      portal_id: portal,
      confidence: bound.confidence === 'column' ? (row.confidence ?? null) : bound.confidence,
    };
  }

  if (kind === 'review') {
    const row = raw
      .prepare(
        `SELECT r.portal_id FROM doc_reviews v
         JOIN doc_revisions rev ON rev.id = v.revision_id
         JOIN doc_records r ON r.id = rev.record_id
         WHERE v.id = ?`,
      )
      .get(id) as { portal_id: string } | undefined;
    if (!row) return null;
    return {
      target_kind: kind,
      target_id: id,
      run_id: null,
      portal_id: row.portal_id,
      confidence: null,
    };
  }

  if (kind === 'doc_record') {
    const row = raw.prepare('SELECT portal_id FROM doc_records WHERE id = ?').get(id) as
      { portal_id: string } | undefined;
    if (!row) return null;
    return {
      target_kind: kind,
      target_id: id,
      run_id: null,
      portal_id: row.portal_id,
      confidence: null,
    };
  }

  // process, process_step: no tables until trace mode (T048).
  return null;
}

/** A `doc_record` target, by key within the portal or by id anywhere. */
function lookupRecord(raw: RawDb, portalId: string, idOrKey: string): ResolvedTarget | null {
  const byKey = raw
    .prepare('SELECT id FROM doc_records WHERE portal_id = ? AND key = ?')
    .get(portalId, idOrKey) as { id: string } | undefined;
  return lookupTarget(raw, { target_kind: 'doc_record', target_id: byKey?.id ?? idOrKey });
}

/**
 * Resolve the evidence a writer cites (research §5). Every target must exist (`UNKNOWN_REF`), belong
 * to `portalId` (`PORTAL_MISMATCH`) and, when it is run-bound, come from one of the session's input
 * runs (`RUN_NOT_IN_SESSION`). A `state` is tied to the run whose observation the writer read: the
 * named `run_id`, or the session's latest run that saw it. Returns the links in input order with the
 * run, portal and confidence the server found; throws `DocsError` on the first link that fails.
 */
export function resolveTargets(
  raw: RawDb,
  portalId: string,
  sessionRunIds: readonly string[],
  links: readonly EvidenceLinkInput[],
): ResolvedTarget[] {
  const inSession = new Set(sessionRunIds);
  return links.map((link, index) => {
    const where = { index, target_kind: link.target_kind, target_id: link.target_id };
    if (link.run_id !== undefined && link.target_kind !== 'state')
      throw new DocsError(
        'SCHEMA_INVALID',
        `evidence[${index}].run_id is only accepted on a state link; the server resolves the run of a ${link.target_kind}`,
        where,
      );

    const found =
      link.target_kind === 'doc_record'
        ? lookupRecord(raw, portalId, link.target_id)
        : lookupTarget(raw, link);
    if (!found)
      throw new DocsError(
        'UNKNOWN_REF',
        link.target_kind === 'process' || link.target_kind === 'process_step'
          ? `evidence[${index}]: ${link.target_kind} targets are not recorded yet (trace mode)`
          : `evidence[${index}]: no ${link.target_kind} with id ${link.target_id}`,
        where,
      );
    if (found.portal_id !== portalId)
      throw new DocsError(
        'PORTAL_MISMATCH',
        `evidence[${index}]: ${link.target_kind} ${link.target_id} belongs to portal ${found.portal_id}, not ${portalId}`,
        { ...where, portal_id: found.portal_id },
      );

    if (link.target_kind === 'state') {
      const observedIn = (
        raw
          .prepare('SELECT run_id FROM state_observations WHERE state_id = ? ORDER BY run_id')
          .all(found.target_id) as { run_id: string }[]
      ).map((r) => r.run_id);
      if (link.run_id !== undefined) {
        if (!observedIn.includes(link.run_id))
          throw new DocsError(
            'UNKNOWN_REF',
            `evidence[${index}]: run ${link.run_id} did not observe state ${link.target_id}`,
            { ...where, run_id: link.run_id },
          );
        if (!inSession.has(link.run_id))
          throw new DocsError(
            'RUN_NOT_IN_SESSION',
            `evidence[${index}]: run ${link.run_id} is not one of this session's runs`,
            { ...where, run_id: link.run_id },
          );
        return { ...found, run_id: link.run_id };
      }
      // Run ids are UUIDv7, so the last one is the most recent observation.
      const runId = observedIn.filter((r) => inSession.has(r)).at(-1);
      if (runId === undefined)
        throw new DocsError(
          'RUN_NOT_IN_SESSION',
          `evidence[${index}]: state ${link.target_id} was not observed by any of this session's runs`,
          { ...where, run_id: observedIn.at(-1) ?? null },
        );
      return { ...found, run_id: runId };
    }

    if (found.run_id !== null && !inSession.has(found.run_id))
      throw new DocsError(
        'RUN_NOT_IN_SESSION',
        `evidence[${index}]: ${link.target_kind} ${link.target_id} comes from run ${found.run_id}, which is not one of this session's runs`,
        { ...where, run_id: found.run_id },
      );
    return found;
  });
}
