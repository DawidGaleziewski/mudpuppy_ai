import { DocKind, KEY_PREFIX, type OpenedDb } from '@pathfinder/core';

/** Raw synchronous connection: every Layer B write runs in one `raw.transaction`. */
export type RawDb = OpenedDb['raw'];

const KIND_BY_PREFIX = new Map<string, DocKind>(
  DocKind.options.map((kind) => [KEY_PREFIX[kind], kind]),
);
const KEY = /^([A-Z]+)-(\d{3,})$/;

/** `REQ-007`: prefix of the kind, sequence zero-padded to three digits and wider when needed. */
export function formatKey(kind: DocKind, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`invalid key sequence: ${seq}`);
  return `${KEY_PREFIX[kind]}-${String(seq).padStart(3, '0')}`;
}

/** The kind and sequence of a key, or null when it is not in canonical form. */
export function parseKey(key: string): { kind: DocKind; seq: number } | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const kind = KIND_BY_PREFIX.get(m[1]!);
  const seq = Number(m[2]);
  if (!kind || seq < 1 || formatKey(kind, seq) !== key) return null;
  return { kind, seq };
}

/**
 * Next sequence for (portal, kind): max + 1. Call it inside the transaction that inserts the record,
 * so two writers cannot get the same number. Withdrawn records keep their row, so a key is never reused.
 */
export function nextSeq(raw: RawDb, portalId: string, kind: DocKind): number {
  const row = raw
    .prepare('SELECT MAX(seq) AS max FROM doc_records WHERE portal_id = ? AND kind = ?')
    .get(portalId, kind) as { max: number | null };
  return (row.max ?? 0) + 1;
}
