import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/log.js';
import { createRedactor, MIN_SECRET_LENGTH, SECRET_MASK, SECRETS } from '../src/secrets.js';

/**
 * The run-scoped redactor (research §6) and the logger that applies it (spec 012 F-12: these
 * guard what leaves the machine, so each registered form and each JSON shape is pinned here).
 * All values are made up.
 */

describe('createRedactor', () => {
  it('replaces nothing before a value is registered', () => {
    const r = createRedactor();
    expect(r.redact('a.b|c')).toBe('a.b|c');
    const obj = { k: 'v' };
    expect(r.redactJson(obj)).toBe(obj);
    expect(r.size).toBe(0);
  });

  it('ignores values shorter than the minimum and counts each value once', () => {
    const r = createRedactor();
    r.add('x'.repeat(MIN_SECRET_LENGTH - 1));
    expect(r.size).toBe(0);
    r.add('abcd');
    r.add('abcd');
    expect(r.size).toBe(1);
    expect(r.redact('xabcdx')).toBe(`x${SECRET_MASK}x`);
  });

  it('replaces the raw, URL-encoded, form-encoded and JSON-escaped forms', () => {
    const r = createRedactor();
    const secret = 'pa ss"wo/rd&1';
    r.add(secret);
    expect(r.redact(`raw=${secret}`)).toBe(`raw=${SECRET_MASK}`);
    expect(r.redact(`url=${encodeURIComponent(secret)}`)).toBe(`url=${SECRET_MASK}`);
    expect(r.redact(`form=${encodeURIComponent(secret).replace(/%20/g, '+')}`)).toBe(
      `form=${SECRET_MASK}`,
    );
    expect(r.redact(`json=${JSON.stringify(secret)}`)).toBe(`json="${SECRET_MASK}"`);
  });

  it('treats regex characters in a secret literally', () => {
    const r = createRedactor();
    r.add('a.b*c');
    expect(r.redact('aXbbbc a.b*c')).toBe(`aXbbbc ${SECRET_MASK}`);
  });

  it('replaces a value containing another registered value whole (longest first)', () => {
    const r = createRedactor();
    r.add('test-key');
    r.add('test-key-not-real');
    expect(r.redact('k=test-key-not-real;')).toBe(`k=${SECRET_MASK};`);
    expect(r.redact('test-key and test-key')).toBe(`${SECRET_MASK} and ${SECRET_MASK}`);
  });

  it('redactJson walks strings, arrays and keys, and leaves other values alone', () => {
    const r = createRedactor();
    r.add('test-key-not-real');
    const out = r.redactJson({
      s: 'v test-key-not-real',
      list: ['test-key-not-real', 1, null, true],
      nested: { 'test-key-not-real': { deep: 'test-key-not-real' } },
      n: 5,
      z: null,
    });
    expect(out).toEqual({
      s: `v ${SECRET_MASK}`,
      list: [SECRET_MASK, 1, null, true],
      nested: { [SECRET_MASK]: { deep: SECRET_MASK } },
      n: 5,
      z: null,
    });
    expect(r.redactJson('test-key-not-real')).toBe(SECRET_MASK);
    expect(r.redactJson(7)).toBe(7);
  });
});

describe('createLogger', () => {
  const sink = () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    return { lines, destination };
  };

  it('redacts registered values in messages and objects, and logs at info by default', () => {
    // Vitest isolates module state per file, so this registration stays local to this file.
    SECRETS.add('test-password-not-real');
    const { lines, destination } = sink();
    const log = createLogger({ destination });
    log.debug('not shown at the default level');
    log.info({ form: { haslo: 'test-password-not-real' } }, 'filled test-password-not-real');
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(line.msg).toBe(`filled ${SECRET_MASK}`);
    expect(line.form).toEqual({ haslo: SECRET_MASK });
    expect(line.level).toBe(30);
    // `base: undefined`: no pid/hostname on every line
    expect(line).not.toHaveProperty('pid');
  });

  it('honours an explicit level', () => {
    const { lines, destination } = sink();
    createLogger({ level: 'debug', destination }).debug('shown');
    expect(lines).toHaveLength(1);
  });
});
