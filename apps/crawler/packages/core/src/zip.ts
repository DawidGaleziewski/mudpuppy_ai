import { crc32, inflateRawSync } from 'node:zlib';

/**
 * The entries of a zip file (Playwright trace chunks), uncompressed, as `name -> bytes`. Reads the
 * central directory; supports stored and deflated entries, which is all Playwright writes.
 */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('broken zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data));
    else throw new Error(`zip entry ${name}: unsupported method ${method}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** A zip of `entries`, stored without compression (small trace chunks; the reader takes both). */
export function zip(entries: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const IMAGE = /\.(jpe?g|png|webp|gif)$/i;

/**
 * `buf` (a zip) with `redact` applied to every non-image entry, or null when nothing changed.
 * Text is read as UTF-8 when that round-trips, else as latin1 (binary resources keep their bytes).
 */
export function redactZip(buf: Buffer, redact: (text: string) => string): Buffer | null {
  const entries = unzip(buf);
  let changed = false;
  for (const [name, data] of entries) {
    if (IMAGE.test(name)) continue;
    const utf8 = data.toString('utf8');
    const enc: BufferEncoding = Buffer.from(utf8, 'utf8').equals(data) ? 'utf8' : 'latin1';
    const text = enc === 'utf8' ? utf8 : data.toString('latin1');
    const out = redact(text);
    if (out === text) continue;
    entries.set(name, Buffer.from(out, enc));
    changed = true;
  }
  return changed ? zip(entries) : null;
}
