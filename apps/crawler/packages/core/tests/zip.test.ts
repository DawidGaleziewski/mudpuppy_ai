import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createRedactor, redactZip, unzip, zip } from '../src/index.js';

describe('zip (spec 009 FR-019a: trace chunks)', () => {
  it('round-trips stored entries', () => {
    const entries = new Map([
      ['trace.trace', Buffer.from('{"a":1}\n')],
      ['resources/x.dat', Buffer.from([0, 255, 128, 7])],
    ]);
    expect(unzip(zip(entries))).toEqual(entries);
  });

  it('reads deflated entries', () => {
    const text = 'Zażółć gęślą jaźń '.repeat(50);
    const stored = zip(new Map([['a.txt', Buffer.from(text)]]));
    // rewrite the one entry as method 8 with a deflated body, as Playwright writes it
    const raw = deflateRawSync(Buffer.from(text));
    const local = Buffer.from(stored.subarray(0, 30 + 5));
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(raw.length, 18);
    const central = Buffer.from(stored.subarray(stored.length - 22 - 46 - 5, stored.length - 22));
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(raw.length, 20);
    const end = Buffer.from(stored.subarray(stored.length - 22));
    end.writeUInt32LE(30 + 5 + raw.length, 16);
    const deflated = Buffer.concat([local, raw, central, end]);
    expect(unzip(deflated).get('a.txt')!.toString()).toBe(text);
  });

  it('redacts secrets in text and binary entries, leaves images alone', () => {
    const r = createRedactor();
    r.add('test-key-not-real');
    const body = 'login=jan&haslo=test-key-not-real';
    const shot = Buffer.from('jpeg test-key-not-real');
    const clean = redactZip(
      zip(
        new Map([
          ['trace.network', Buffer.from(`{"postData":"${body}","ż":"ó"}`)],
          ['resources/b.dat', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body)])],
          ['resources/s.jpeg', shot],
        ]),
      ),
      r.redact,
    );
    const out = unzip(clean!);
    expect(out.get('trace.network')!.toString()).toBe(
      '{"postData":"login=jan&haslo=[secret]","ż":"ó"}',
    );
    expect(out.get('resources/b.dat')!.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    expect(out.get('resources/b.dat')!.toString('latin1')).toContain('haslo=[secret]');
    expect(out.get('resources/s.jpeg')).toEqual(shot);
  });

  it('returns null when nothing changes', () => {
    const r = createRedactor();
    r.add('test-key-not-real');
    expect(redactZip(zip(new Map([['a', Buffer.from('nothing here')]])), r.redact)).toBeNull();
  });
});
