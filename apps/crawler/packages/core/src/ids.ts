import { randomBytes } from 'node:crypto';

let lastMs = 0;
let seq = 0;

/**
 * Server-side UUIDv7 (RFC 9562): 48-bit unix ms, 12-bit counter, 62 random bits.
 * Ids created in the same process are strictly increasing, so ordering by id is FIFO.
 * No API accepts client-chosen ids for new rows.
 */
export function newId(now: number = Date.now()): string {
  if (now > lastMs) {
    lastMs = now;
    seq = 0;
  } else {
    seq += 1;
    if (seq > 0xfff) {
      lastMs += 1;
      seq = 0;
    }
  }
  const b = randomBytes(16);
  b[0] = (lastMs / 2 ** 40) & 0xff;
  b[1] = (lastMs / 2 ** 32) & 0xff;
  b[2] = (lastMs / 2 ** 24) & 0xff;
  b[3] = (lastMs / 2 ** 16) & 0xff;
  b[4] = (lastMs / 2 ** 8) & 0xff;
  b[5] = lastMs & 0xff;
  b[6] = 0x70 | (seq >> 8);
  b[7] = seq & 0xff;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** UTC ISO 8601 with milliseconds, the storage format for every timestamp column. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
