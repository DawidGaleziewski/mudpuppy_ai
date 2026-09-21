import { describe, expect, it } from 'vitest';
import { newId, nowIso } from '../src/ids.js';
import { Timestamp } from '../src/schemas/index.js';

describe('newId', () => {
  it('produces RFC 9562 UUIDv7 strings', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it('is unique and strictly increasing, even within one millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => newId(1_700_000_000_000));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
  it('encodes the timestamp in the first 48 bits', () => {
    const ms = 1_700_000_000_123;
    const hex = newId(ms).replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBeGreaterThanOrEqual(ms);
  });
});

describe('nowIso', () => {
  it('matches the Timestamp schema', () => {
    expect(Timestamp.safeParse(nowIso()).success).toBe(true);
  });
});
