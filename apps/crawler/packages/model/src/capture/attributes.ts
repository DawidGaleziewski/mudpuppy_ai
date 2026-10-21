/**
 * Attribute writes and snapshots (spec 039 design § 5.8): persona attributes, typed inputs and
 * shown values per journey position, and the snapshot decision mining reads. Pure.
 */

export type ValueType = 'number' | 'date' | 'enum' | 'bool' | 'text' | 'missing';

export interface AttributeWrite {
  journeyId: string;
  /** 0 = journey start (persona); else the transition seq that made it known. */
  seq: number;
  /** `persona.segment`, `input.vehicle_value`, `shown.premium`. */
  name: string;
  source: 'persona' | 'input' | 'shown';
  valueType: ValueType;
  valueNum: number | null;
  valueText: string | null;
}

export interface JourneyLink {
  id: string;
  parentId: string | null;
  /** Parent's transition seq this journey branches after; null for a root. */
  branchSeq: number | null;
}

/** Per name, the latest write at or below `limit`, plus inputs typed at `typedAt`. */
function latestWrites(
  list: readonly AttributeWrite[],
  limit: number,
  typedAt: number | null,
): Map<string, AttributeWrite> {
  const best = new Map<string, AttributeWrite>();
  for (const w of list) {
    const typedHere = w.seq === typedAt && w.source === 'input';
    if (w.seq > limit && !typedHere) continue;
    const prev = best.get(w.name);
    if (!prev || w.seq > prev.seq) best.set(w.name, w);
  }
  return best;
}

/**
 * The attribute snapshot just before transition `seq` of journey `journeyId`: per name, the write
 * with the largest seq below `seq` in the journey, else (for names it never wrote) the parent's
 * write at or below the branch point, and so on up. A name nobody wrote is absent: missing, never
 * a default. Inputs the transition itself typed (map-mode autofill fills the form at its submit,
 * same seq) are known before it is pressed, so they count (F-21@039); shown values at that seq
 * are what it revealed, so they do not.
 */
export function snapshotAt(
  writes: readonly AttributeWrite[],
  journeys: ReadonlyMap<string, JourneyLink>,
  journeyId: string,
  seq: number,
): Map<string, AttributeWrite> {
  const byJourney = new Map<string, AttributeWrite[]>();
  for (const w of writes) {
    const list = byJourney.get(w.journeyId) ?? [];
    list.push(w);
    byJourney.set(w.journeyId, list);
  }
  const out = new Map<string, AttributeWrite>();
  let current: string | null = journeyId;
  let limit = seq - 1; // writes at seq ≤ limit are known before transition `seq`
  const visited = new Set<string>();
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const typedAt = current === journeyId ? seq : null;
    const best = latestWrites(byJourney.get(current) ?? [], limit, typedAt);
    for (const [name, w] of best) if (!out.has(name)) out.set(name, w);
    const link = journeys.get(current);
    if (!link || link.parentId === null || link.branchSeq === null) break;
    current = link.parentId;
    limit = link.branchSeq;
  }
  return out;
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_PL = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
const BOOLS: Record<string, boolean> = {
  tak: true,
  nie: false,
  yes: true,
  no: false,
  true: true,
  false: false,
};

/** `\s` also matches the no-break space portals put between thousands. */
const NUMBER = /^-?[\d\s.]*\d(?:,\d+)?\s*(?:zł|pln|eur|usd|€|\$|%)?$/i;
const UNIT = /\s*(?:zł|pln|eur|usd|€|\$|%)$/i;

/** A number in Polish or English notation (`1 234,56 zł`, `1.234,50`, `12.5`), else null. */
function parseNumber(s: string): number | null {
  if (!NUMBER.test(s)) return null;
  const n = Number(
    s
      .replace(UNIT, '')
      .replace(/\s/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? n : null;
}

/**
 * Type a shown or typed value: numbers in Polish or English notation (with spaces, `,` decimals and
 * a currency), dates (ISO or `dd.mm.yyyy`, kept as ISO text), yes/no words, else text.
 */
export function typeValue(
  raw: string,
): Pick<AttributeWrite, 'valueType' | 'valueNum' | 'valueText'> {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s === '') return { valueType: 'missing', valueNum: null, valueText: null };
  if (DATE_ISO.test(s)) return { valueType: 'date', valueNum: null, valueText: s };
  const pl = DATE_PL.exec(s);
  if (pl) {
    const [, d, m, y] = pl;
    return {
      valueType: 'date',
      valueNum: null,
      valueText: `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`,
    };
  }
  const bool = BOOLS[s.toLowerCase()];
  if (bool !== undefined) return { valueType: 'bool', valueNum: bool ? 1 : 0, valueText: s };
  const num = parseNumber(s);
  if (num !== null) return { valueType: 'number', valueNum: num, valueText: s };
  return { valueType: 'text', valueNum: null, valueText: s };
}

/** Normalised attribute name part from a label: lower-case, words joined by `_`, no punctuation. */
export function attributeName(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

/** Whole years and days between a date and the capture day, for rules like "under 18". */
export function ageOf(
  dateIso: string,
  capturedIso: string,
): { years: number; days: number } | null {
  const a = DATE_ISO.exec(dateIso);
  const b = DATE_ISO.exec(capturedIso.slice(0, 10));
  if (!a || !b) return null;
  const [ay, am, ad] = [Number(a[1]), Number(a[2]), Number(a[3])];
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];
  let years = by - ay;
  if (bm < am || (bm === am && bd < ad)) years -= 1;
  const days = Math.floor((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
  return { years, days };
}
