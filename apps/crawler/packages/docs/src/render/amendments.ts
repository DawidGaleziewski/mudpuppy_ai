import { doc, table } from './format.js';

/**
 * BA amendments (R-30 spec 010 FR-017, FR-018, FR-023): to-be notes kept apart from the observed
 * facts. Rendered in their own files, only when the portal has amendments, so the as-is chapters
 * and an amendment-free export stay byte-identical (SC-007).
 */
export interface ExportAmendment {
  key: string;
  status: 'active' | 'superseded' | 'dismissed';
  target_kind: string;
  target_id: string;
  kind: string;
  text: string | null;
  attachment_name: string | null;
  attachment_sha256: string | null;
  author: string;
  created_at: string;
  superseded_by_run: string | null;
  superseded_reason: string | null;
  superseded_detail: string | null;
  superseded_at: string | null;
  dismissed_at: string | null;
  /** Key of the active copy that re-applied this one, when it was re-applied. */
  reapplied_as: string | null;
  /** Key of the superseded original this one re-applies. */
  reapplies: string | null;
}

type RawDb = { prepare(sql: string): { all(...a: unknown[]): unknown[] } };

/** Amendments of a portal in key order; withdrawn ones are left out (the BA took them back). */
export function loadAmendments(raw: RawDb, portalId: string): ExportAmendment[] {
  const exists = raw
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'amendments'`)
    .all();
  if (exists.length === 0) return [];
  return raw
    .prepare(
      `SELECT a.key, a.status, a.target_kind, a.target_id, a.kind, a.text, a.attachment_name,
              a.attachment_sha256, a.author, a.created_at, a.superseded_by_run, a.superseded_reason,
              a.superseded_detail, a.superseded_at, a.dismissed_at,
              (SELECT b.key FROM amendments b WHERE b.id = a.reapplied_as) AS reapplied_as,
              (SELECT b.key FROM amendments b WHERE b.id = a.reapplies) AS reapplies
       FROM amendments a WHERE a.portal_id = ? AND a.status <> 'withdrawn'
       ORDER BY length(a.key), a.key`,
    )
    .all(portalId) as ExportAmendment[];
}

const target = (a: ExportAmendment): string => `${a.target_kind} \`${a.target_id}\``;

const what = (a: ExportAmendment): string =>
  [a.text ?? '', a.attachment_name ? `(attachment: ${a.attachment_name})` : '']
    .filter((s) => s !== '')
    .join(' ');

/** `13-to-be-amendments.md`: active amendments only. */
export function toBeAmendments(portalId: string, list: readonly ExportAmendment[]): string {
  const active = list.filter((a) => a.status === 'active');
  return doc([
    '# 13. To-be amendments',
    '',
    `Changes the BA wants to the as-is portal \`${portalId}\`. These are **to-be** statements, not`,
    'observed facts: every other chapter describes the portal as it was recorded. Superseded and',
    'dismissed amendments are listed in `appendix-superseded-amendments.md`.',
    '',
    ...(active.length === 0
      ? ['_none active_']
      : table(
          ['Key', 'Target', 'Kind', 'Amendment', 'Author', 'Written', 'Re-applies'],
          active.map((a) => [
            `**${a.key}**`,
            target(a),
            a.kind,
            what(a),
            a.author,
            a.created_at.slice(0, 10),
            a.reapplies ?? '',
          ]),
        )),
  ]);
}

/** `appendix-superseded-amendments.md`: what was dropped and why (FR-023). */
export function supersededAmendments(list: readonly ExportAmendment[]): string {
  const gone = list.filter((a) => a.status !== 'active');
  return doc([
    '# Appendix: superseded and dismissed amendments',
    '',
    'Amendments a fresh run made out of date (the screen or element they targeted changed) and',
    'amendments the BA dismissed. They are not part of the to-be chapter.',
    '',
    ...(gone.length === 0
      ? ['_none_']
      : table(
          ['Key', 'Status', 'Target', 'Amendment', 'Reason', 'Run', 'When', 'Re-applied as'],
          gone.map((a) => [
            `**${a.key}**`,
            a.status,
            target(a),
            what(a),
            [a.superseded_reason, a.superseded_detail].filter((s) => s).join(': '),
            a.superseded_by_run ?? '',
            (a.status === 'dismissed' ? a.dismissed_at : a.superseded_at)?.slice(0, 10) ?? '',
            a.reapplied_as ?? '',
          ]),
        )),
  ]);
}
