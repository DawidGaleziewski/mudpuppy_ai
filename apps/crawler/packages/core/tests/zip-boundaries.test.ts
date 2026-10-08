import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createRedactor, redactZip, unzip, zip } from '../src/index.js';

/**
 * Zip edge cases (spec 012 F-12): an archive comment up to the format's 65,535-byte limit, extra
 * fields and entry comments, the writer's header fields other readers rely on (the trace viewer
 * opens these chunks), and the errors for what is not a zip.
 */

const EOCD = 22;

/** `buf` with an archive comment of `n` bytes after the end-of-central-directory record. */
function withComment(buf: Buffer, n: number): Buffer {
  const out = Buffer.concat([buf, Buffer.alloc(n, 0x41)]);
  out.writeUInt16LE(n, buf.length - EOCD + 20);
  return out;
}

describe('unzip: finding the end of central directory', () => {
  const entries = new Map([['a.txt', Buffer.from('hello')]]);

  it('finds it before a short archive comment and before a maximum-length one', () => {
    expect(unzip(withComment(zip(entries), 5))).toEqual(entries);
    expect(unzip(withComment(zip(entries), 0xffff))).toEqual(entries);
  });

  it('reads an empty archive, whose record starts at offset 0', () => {
    expect(unzip(zip(new Map())).size).toBe(0);
  });

  it('refuses what is not a zip', () => {
    expect(() => unzip(Buffer.alloc(30))).toThrow('not a zip file (no end of central directory)');
    expect(() => unzip(Buffer.alloc(10))).toThrow('not a zip file (no end of central directory)');
  });

  it('refuses a broken central directory and an unsupported method', () => {
    const z = zip(entries);
    const broken = Buffer.from(z);
    broken.writeUInt32LE(0, z.length - EOCD - 46 - 5);
    expect(() => unzip(broken)).toThrow('broken zip central directory');
    const bzip2 = Buffer.from(z);
    bzip2.writeUInt16LE(12, z.length - EOCD - 46 - 5 + 10);
    expect(() => unzip(bzip2)).toThrow('zip entry a.txt: unsupported method 12');
  });
});

describe('unzip: variable-length fields', () => {
  it('skips a local extra field, and a central extra field and comment before the next entry', () => {
    const a = Buffer.from('first');
    const b = Buffer.from('second');
    const z = zip(
      new Map([
        ['a', a],
        ['b', b],
      ]),
    );
    // Local headers: [30 + 1 + 5] for a, then [30 + 1 + 6] for b; central records follow.
    const localA = z.subarray(0, 30 + 1);
    const restLocal = z.subarray(30 + 1, 30 + 1 + 5 + 30 + 1 + 6);
    const centralA = Buffer.from(z.subarray(73, 73 + 46 + 1));
    const centralB = Buffer.from(z.subarray(73 + 47, 73 + 47 + 46 + 1));
    const end = Buffer.from(z.subarray(z.length - EOCD));
    // a's local header gets a 4-byte extra field; b's data moves 4 bytes on.
    const localAx = Buffer.from(localA);
    localAx.writeUInt16LE(4, 28);
    // a's central record gets a 2-byte extra field and a 3-byte comment.
    centralA.writeUInt16LE(2, 30);
    centralA.writeUInt16LE(3, 32);
    centralB.writeUInt32LE(30 + 1 + 4 + 5, 42);
    const locals = Buffer.concat([localAx, Buffer.alloc(4), restLocal]);
    end.writeUInt32LE(locals.length, 16);
    const out = unzip(Buffer.concat([locals, centralA, Buffer.alloc(5), centralB, end]));
    expect(out.get('a')).toEqual(a);
    expect(out.get('b')).toEqual(b);
  });
});

describe('zip: the header fields other readers rely on', () => {
  it('writes signatures, versions, UTF-8 flag, CRC, sizes and counts', () => {
    const data = Buffer.from('zażółć');
    const z = zip(new Map([['ż.txt', data]]));
    const name = Buffer.from('ż.txt');
    const crc = crc32(data);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    expect(z.readUInt16LE(4)).toBe(20);
    expect(z.readUInt16LE(6)).toBe(0x0800);
    expect(z.readUInt32LE(14)).toBe(crc);
    expect(z.readUInt32LE(18)).toBe(data.length);
    expect(z.readUInt32LE(22)).toBe(data.length);
    expect(z.readUInt16LE(26)).toBe(name.length);
    const c = 30 + name.length + data.length;
    expect(z.readUInt32LE(c)).toBe(0x02014b50);
    expect(z.readUInt16LE(c + 4)).toBe(20);
    expect(z.readUInt16LE(c + 6)).toBe(20);
    expect(z.readUInt16LE(c + 8)).toBe(0x0800);
    expect(z.readUInt32LE(c + 16)).toBe(crc);
    expect(z.readUInt32LE(c + 20)).toBe(data.length);
    expect(z.readUInt32LE(c + 24)).toBe(data.length);
    const e = z.length - EOCD;
    expect(z.readUInt32LE(e)).toBe(0x06054b50);
    expect(z.readUInt16LE(e + 8)).toBe(1);
    expect(z.readUInt16LE(e + 10)).toBe(1);
    expect(z.readUInt32LE(e + 12)).toBe(46 + name.length);
    expect(z.readUInt32LE(e + 16)).toBe(c);
  });
});

describe('redactZip: which entries are images', () => {
  it('leaves .jpg alone but redacts a name that only contains an image extension', () => {
    const r = createRedactor();
    r.add('test-key-not-real');
    const secret = Buffer.from('k=test-key-not-real');
    const out = unzip(
      redactZip(
        zip(
          new Map([
            ['s.JPG', secret],
            ['x.png.txt', secret],
          ]),
        ),
        r.redact,
      )!,
    );
    expect(out.get('s.JPG')).toEqual(secret);
    expect(out.get('x.png.txt')!.toString()).toBe('k=[secret]');
  });
});
