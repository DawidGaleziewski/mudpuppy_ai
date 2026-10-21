import { readFileSync } from 'node:fs';
import { createEvidenceStore, elementKeys, parseAriaYaml, type Confidence } from '@pathfinder/core';
import type { EvidenceTargetKind } from '@pathfinder/docs-model';
import { DocsError } from './errors.js';
import type { RawDb } from './keys.js';
import type { ResolvedTarget } from './observed-rule.js';

/** An evidence link as a writer states it; the server resolves the run. */
export interface EvidenceLinkInput {
  target_kind: EvidenceTargetKind;
  /** Row id; a `doc_record` may also be named by its key; a `screen_region` names its state. */
  target_id: string;
  /** Only for `state` and `screen_region`: which run's observation of the state is meant. */
  run_id?: string | undefined;
  /** Only for `screen_region`: the cited element key (spec 008, contracts/element-key.md). */
  region?: string | undefined;
}

/** Element keys of a state from its stored snapshot; null when the snapshot cannot be read. */
export type ElementKeysOf = (stateId: string) => readonly string[] | null;

/** Kinds whose target is a state row: the state itself, or a region of its screenshot. */
const STATE_KINDS: readonly EvidenceTargetKind[] = ['state', 'screen_region'];

/** {@link ElementKeysOf} reading each state's ARIA snapshot from the evidence store. */
export function elementKeysReader(raw: RawDb, evidenceRoot: string): ElementKeysOf {
  const store = createEvidenceStore(evidenceRoot);
  const refOf = raw.prepare('SELECT evidence_ref FROM states WHERE id = ?');
  const cache = new Map<string, readonly string[] | null>();
  return (stateId) => {
    if (cache.has(stateId)) return cache.get(stateId)!;
    const row = refOf.get(stateId) as { evidence_ref: string } | undefined;
    let keys: readonly string[] | null = null;
    try {
      if (row) {
        const yaml = readFileSync(store.resolve(row.evidence_ref), 'utf8');
        keys = elementKeys(parseAriaYaml(yaml)).map((e) => e.key);
      }
    } catch {
      keys = null;
    }
    cache.set(stateId, keys);
    return keys;
  };
}

/** Up to `n` keys most like `wanted` (edit distance on lower case), for a refusal message. */
export function closestKeys(wanted: string, keys: readonly string[], n = 10): string[] {
  const a = wanted.toLowerCase();
  const distance = (b: string): number => {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0]!;
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const up = prev[j]!;
        prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = up;
      }
    }
    return prev[b.length]!;
  };
  return keys
    .map((k, i) => ({ k, i, d: distance(k.toLowerCase()) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .slice(0, n)
    .map((x) => x.k);
}

/**
 * Run-bound Layer A tables whose rows carry their own `run_id`. `confidence` is the column to read,
 * or the fixed value where the table has none: actions and network calls are recorded by the server
 * as it sees them (observed); crawler questions and decisions say nothing about the portal's behaviour.
 */
const RUN_BOUND: Partial<
  Record<EvidenceTargetKind, { table: string; confidence: 'column' | Confidence | null }>
> = {
  transition: { table: 'transitions', confidence: 'column' },
  form: { table: 'forms', confidence: 'column' },
  action: { table: 'actions', confidence: 'observed' },
  network_call: { table: 'network_calls', confidence: 'observed' },
  // spec 019: the server saw the browser at that URL (R-37/R-38)
  observation: { table: 'observations', confidence: 'observed' },
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
 * reports what it finds. Returns null when the target does not exist.
 */
export function lookupTarget(raw: RawDb, link: EvidenceLinkInput): ResolvedTarget | null {
  const { target_kind: kind, target_id: id } = link;

  if (STATE_KINDS.includes(kind)) {
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
      ...(kind === 'screen_region' && link.region !== undefined ? { region: link.region } : {}),
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

  // A hypothesis of the portal model (spec 039 owner answer 18): not run-bound, no confidence of its
  // own (a person confirms it; the record says how sure it is).
  if (kind === 'hypothesis') {
    const row = raw.prepare('SELECT portal_id FROM hypotheses WHERE id = ?').get(id) as
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

  // A process is run-bound through its trace run; it carries no confidence of its own. A step is
  // recorded by the server as it observes the page, so its own confidence column decides.
  if (kind === 'process') {
    const row = raw.prepare('SELECT run_id, portal_id FROM processes WHERE id = ?').get(id) as
      { run_id: string; portal_id: string } | undefined;
    if (!row) return null;
    return {
      target_kind: kind,
      target_id: id,
      run_id: row.run_id,
      portal_id: row.portal_id,
      confidence: null,
    };
  }

  if (kind === 'process_step') {
    const row = raw
      .prepare(
        `SELECT p.run_id, p.portal_id, s.confidence FROM process_steps s
         JOIN processes p ON p.id = s.process_id WHERE s.id = ?`,
      )
      .get(id) as { run_id: string; portal_id: string; confidence: Confidence } | undefined;
    if (!row) return null;
    return {
      target_kind: kind,
      target_id: id,
      run_id: row.run_id,
      portal_id: row.portal_id,
      confidence: row.confidence,
    };
  }

  return null;
}

/** A `hypothesis` target, by key within the portal (`H-0042`) or by id anywhere. */
function lookupHypothesis(raw: RawDb, portalId: string, idOrKey: string): ResolvedTarget | null {
  const byKey = raw
    .prepare('SELECT id FROM hypotheses WHERE portal_id = ? AND key = ?')
    .get(portalId, idOrKey) as { id: string } | undefined;
  return lookupTarget(raw, { target_kind: 'hypothesis', target_id: byKey?.id ?? idOrKey });
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
  /** Checks a `screen_region` key against the state's snapshot; skipped when absent. */
  opts: { elementKeysOf?: ElementKeysOf } = {},
): ResolvedTarget[] {
  const inSession = new Set(sessionRunIds);
  return links.map((link, index) => {
    const where = { index, target_kind: link.target_kind, target_id: link.target_id };
    const onState = STATE_KINDS.includes(link.target_kind);
    if (link.run_id !== undefined && !onState)
      throw new DocsError(
        'SCHEMA_INVALID',
        `evidence[${index}].run_id is only accepted on a state or screen_region link; the server resolves the run of a ${link.target_kind}`,
        where,
      );
    if (link.target_kind === 'screen_region' && !link.region)
      throw new DocsError(
        'SCHEMA_INVALID',
        `evidence[${index}].region is required on a screen_region link: an element key of the state, as listed by get_evidence`,
        { ...where, field: 'region' },
      );
    if (link.target_kind !== 'screen_region' && link.region !== undefined)
      throw new DocsError(
        'SCHEMA_INVALID',
        `evidence[${index}].region is only accepted on a screen_region link`,
        { ...where, field: 'region' },
      );

    const found =
      link.target_kind === 'doc_record'
        ? lookupRecord(raw, portalId, link.target_id)
        : link.target_kind === 'hypothesis'
          ? lookupHypothesis(raw, portalId, link.target_id)
          : lookupTarget(raw, link);
    if (!found)
      throw new DocsError(
        'UNKNOWN_REF',
        `evidence[${index}]: no ${link.target_kind} with id ${link.target_id}`,
        where,
      );
    if (found.portal_id !== portalId)
      throw new DocsError(
        'PORTAL_MISMATCH',
        `evidence[${index}]: ${link.target_kind} ${link.target_id} belongs to portal ${found.portal_id}, not ${portalId}`,
        { ...where, portal_id: found.portal_id },
      );

    if (link.target_kind === 'screen_region') {
      const keys = opts.elementKeysOf?.(found.target_id);
      if (keys && !keys.includes(link.region!))
        throw new DocsError(
          'UNKNOWN_REF',
          `evidence[${index}]: state ${link.target_id} has no element ${JSON.stringify(link.region)}; closest keys: ${closestKeys(link.region!, keys).join(' | ') || '(none)'}`,
          { ...where, region: link.region, closest: closestKeys(link.region!, keys) },
        );
    }

    if (onState) {
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
