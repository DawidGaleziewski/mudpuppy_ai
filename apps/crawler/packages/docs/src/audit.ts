import type {
  Confidence,
  DocKind,
  EvidenceTargetKind,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@pathfinder/core';
import { lookupTarget } from './evidence.js';
import type { RawDb } from './keys.js';
import { checkObserved, type ResolvedTarget } from './observed-rule.js';
import { recordColumns } from './status-engine.js';

/** The integrity checks of `docs:audit` (contracts/operator-cli.md; SC-001, SC-002). */
export const AUDIT_CHECKS = [
  /** A revision has no evidence link. */
  'missing_evidence',
  /** A link points at a row that does not exist. */
  'broken_link',
  /** A link points at a row of another portal. */
  'link_portal_mismatch',
  /** A link's `run_id` is not the run its target came from. */
  'link_run_mismatch',
  /** An `observed` revision cites nothing that was itself observed. */
  'observed_rule',
  /** A revision's status does not follow from its reviews and later revisions. */
  'status_unexplained',
  /** `doc_records` columns differ from what the revisions say. */
  'denormalised_mismatch',
  /** A `followup` record has no `followup_tasks` row. */
  'followup_without_task',
] as const;
export type AuditCheck = (typeof AUDIT_CHECKS)[number];

export interface AuditFinding {
  check: AuditCheck;
  portal_id: string;
  key: string;
  /** Null when the finding is about the record, not one revision. */
  rev_no: number | null;
  detail: string;
}

export interface AuditReport {
  /** The portal audited, or null for every portal in the store. */
  portal_id: string | null;
  records: number;
  revisions: number;
  links: number;
  ok: boolean;
  findings: AuditFinding[];
}

interface RecordRow {
  id: string;
  portal_id: string;
  kind: DocKind;
  key: string;
  title: string;
  latest_rev: number;
  confirmed_rev: number | null;
  withdrawn: 0 | 1;
}
interface RevisionRow {
  id: string;
  rev_no: number;
  change: RevisionChange;
  confidence: Confidence;
  status: RevisionStatus;
  title: string | null;
}
interface LinkRow {
  target_kind: EvidenceTargetKind;
  target_id: string;
  run_id: string | null;
}

/**
 * The status a revision must have given its reviews and what came after it. Order-free restatement
 * of the status engine: a confirmed revision stays until a later one is confirmed; a rejected one
 * stays rejected; an undecided one is a draft only while it is the latest.
 */
function expectedStatus(
  revNo: number,
  latest: number,
  reviewed: ReadonlyMap<number, ReadonlySet<ReviewAction>>,
): RevisionStatus {
  if (reviewed.get(revNo)?.has('confirm')) {
    const laterConfirmed = [...reviewed].some(
      ([n, actions]) => n > revNo && actions.has('confirm'),
    );
    return laterConfirmed ? 'superseded' : 'confirmed';
  }
  if (reviewed.get(revNo)?.has('reject')) return 'rejected';
  return revNo === latest ? 'draft' : 'superseded';
}

/** Read-only integrity check of the Layer B rows of one portal, or of the whole store. */
export function audit(raw: RawDb, portalId?: string): AuditReport {
  const findings: AuditFinding[] = [];
  const records = raw
    .prepare(
      `SELECT id, portal_id, kind, key, title, latest_rev, confirmed_rev, withdrawn FROM doc_records
       WHERE (? IS NULL OR portal_id = ?) ORDER BY portal_id, kind, seq`,
    )
    .all(portalId ?? null, portalId ?? null) as RecordRow[];
  const revisionsOf = raw.prepare(
    `SELECT id, rev_no, change, confidence, status, json_extract(content_json, '$.title') AS title
     FROM doc_revisions WHERE record_id = ? ORDER BY rev_no`,
  );
  const linksOf = raw.prepare(
    'SELECT target_kind, target_id, run_id FROM doc_evidence_links WHERE revision_id = ? ORDER BY id',
  );
  const reviewsOf = raw.prepare(
    `SELECT rev.rev_no, v.action FROM doc_reviews v JOIN doc_revisions rev ON rev.id = v.revision_id
     WHERE rev.record_id = ?`,
  );
  const observed = raw.prepare(
    'SELECT 1 FROM state_observations WHERE state_id = ? AND run_id = ?',
  );
  const task = raw.prepare('SELECT 1 FROM followup_tasks WHERE record_id = ?');

  let revisionCount = 0;
  let linkCount = 0;
  for (const record of records) {
    const add = (check: AuditCheck, rev_no: number | null, detail: string): void => {
      findings.push({ check, portal_id: record.portal_id, key: record.key, rev_no, detail });
    };
    const revisions = revisionsOf.all(record.id) as RevisionRow[];
    revisionCount += revisions.length;

    const reviewed = new Map<number, Set<ReviewAction>>();
    for (const r of reviewsOf.all(record.id) as { rev_no: number; action: ReviewAction }[]) {
      const actions = reviewed.get(r.rev_no) ?? new Set<ReviewAction>();
      actions.add(r.action);
      reviewed.set(r.rev_no, actions);
    }
    const latest = revisions.at(-1)?.rev_no ?? 0;

    for (const rev of revisions) {
      const links = linksOf.all(rev.id) as LinkRow[];
      linkCount += links.length;
      if (links.length === 0) add('missing_evidence', rev.rev_no, 'the revision cites no evidence');

      const targets: ResolvedTarget[] = [];
      for (const link of links) {
        const name = `${link.target_kind} ${link.target_id}`;
        const target = lookupTarget(raw, {
          target_kind: link.target_kind,
          target_id: link.target_id,
          ...(link.run_id !== null ? { run_id: link.run_id } : {}),
        });
        if (!target) {
          add('broken_link', rev.rev_no, `${name} does not exist`);
          continue;
        }
        if (target.portal_id !== record.portal_id) {
          add('link_portal_mismatch', rev.rev_no, `${name} belongs to portal ${target.portal_id}`);
          continue;
        }
        const runOk =
          link.target_kind === 'state'
            ? link.run_id !== null && observed.get(link.target_id, link.run_id) !== undefined
            : target.run_id === link.run_id;
        if (!runOk) {
          add(
            'link_run_mismatch',
            rev.rev_no,
            link.target_kind === 'state'
              ? `run ${link.run_id} did not observe ${name}`
              : `${name} comes from run ${target.run_id}, the link says ${link.run_id}`,
          );
          continue;
        }
        targets.push(target);
      }
      if (rev.confidence === 'observed' && !checkObserved(targets).ok)
        add('observed_rule', rev.rev_no, 'observed, but no cited target was itself observed');

      const expected = expectedStatus(rev.rev_no, latest, reviewed);
      if (rev.status !== expected)
        add(
          'status_unexplained',
          rev.rev_no,
          `status is ${rev.status}; its reviews and later revisions give ${expected}`,
        );
    }

    if (revisions.length === 0) {
      add('denormalised_mismatch', null, 'the record has no revision');
    } else {
      const want = recordColumns(revisions.map((r) => ({ ...r, title: r.title ?? '' })));
      for (const column of ['latest_rev', 'confirmed_rev', 'title', 'withdrawn'] as const)
        if (record[column] !== want[column])
          add(
            'denormalised_mismatch',
            null,
            `${column} is ${JSON.stringify(record[column])}; the revisions give ${JSON.stringify(want[column])}`,
          );
    }

    if (record.kind === 'followup' && task.get(record.id) === undefined)
      add('followup_without_task', null, 'the follow-up has no task row');
  }

  return {
    portal_id: portalId ?? null,
    records: records.length,
    revisions: revisionCount,
    links: linkCount,
    ok: findings.length === 0,
    findings,
  };
}
