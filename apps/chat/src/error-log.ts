import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECRETS, createRedactor, maskText, scrubJson } from '@mudpuppy/core';

/** Files older than this many days are removed by {@link sweepErrorLogs}. */
export const RETENTION_DAYS = 30;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REF_RE = /^ERR-[0-9A-HJKMNP-TV-Z]{26}$/;
const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** Repo root: this file is `apps/chat/src/error-log.ts`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const DEFAULT_LOGS_DIR = join(REPO_ROOT, 'data', 'logs', 'chat');

export interface ErrorLogOptions {
  /** Folder for the daily files. Default `data/logs/chat` under the repo root. */
  logsDir?: string;
  /** Extra secret values to scrub besides everything registered in the core `SECRETS` redactor. */
  secrets?: readonly string[];
  /** Clock, for tests. */
  now?: Date;
}

export interface ErrorInput {
  conversation_id?: string | null;
  /** Workflow step the error happened in, if any. */
  step?: string | null;
  /** Component or operation, e.g. `acp-client` or `POST /messages`. */
  where: string;
  message: string;
  detail?: unknown;
}

export interface ErrorRecord {
  ref: string;
  time: string;
  conversation_id: string | null;
  step: string | null;
  where: string;
  message: string;
  detail: unknown;
}

export interface LogResult {
  ref: string;
  /** False when the line could not be written; the UI should say "not logged". */
  logged: boolean;
}

/** ULID (48-bit ms timestamp + 80 random bits, Crockford base32, 26 chars) with the `ERR-` prefix. */
export function newErrorRef(now: number = Date.now()): string {
  let t = now;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32]! + time;
    t = Math.floor(t / 32);
  }
  const b = randomBytes(10);
  // 80 bits as 16 groups of 5 bits
  let bits = 0n;
  for (const byte of b) bits = (bits << 8n) | BigInt(byte);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand = CROCKFORD[Number(bits & 31n)]! + rand;
    bits >>= 5n;
  }
  return `ERR-${time}${rand}`;
}

export function isErrorRef(value: string): boolean {
  return REF_RE.test(value);
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

function redactor(extra: readonly string[] | undefined) {
  const r = createRedactor();
  for (const s of extra ?? []) r.add(s);
  return (text: string): string => maskText(r.redact(SECRETS.redact(text)));
}

function redactDetail(detail: unknown, extra: readonly string[] | undefined): unknown {
  if (detail === undefined) return null;
  // Round-trip through JSON so Error objects, bigint and cycles cannot make the write throw.
  // The class goes under `error_class`: `scrubJson` redacts any key called `name` (F-21).
  let plain: unknown;
  try {
    plain = JSON.parse(
      JSON.stringify(detail, (_k, v: unknown) =>
        v instanceof Error ? { error_class: v.name, message: v.message, stack: v.stack } : v,
      ),
    );
  } catch {
    // a bigint, or a cycle, a function: its class name is enough ("[object Object]" says nothing)
    plain =
      typeof detail === 'bigint' ? detail.toString() : `[${(detail as object).constructor.name}]`;
  }
  const r = createRedactor();
  for (const s of extra ?? []) r.add(s);
  return scrubJson(r.redactJson(SECRETS.redactJson(plain)));
}

/**
 * Append one redacted JSON line for an error and return its reference. Never throws: when the
 * folder is not writable the ref is still returned, with `logged: false`.
 */
export async function logError(input: ErrorInput, opts: ErrorLogOptions = {}): Promise<LogResult> {
  const now = opts.now ?? new Date();
  const ref = newErrorRef(now.getTime());
  try {
    const scrub = redactor(opts.secrets);
    const record: ErrorRecord = {
      ref,
      time: now.toISOString(),
      conversation_id: input.conversation_id ?? null,
      step: input.step ?? null,
      where: scrub(input.where),
      message: scrub(input.message),
      detail: redactDetail(input.detail, opts.secrets),
    };
    const dir = opts.logsDir ?? DEFAULT_LOGS_DIR;
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${dayOf(now)}.jsonl`), JSON.stringify(record) + '\n', 'utf8');
    return { ref, logged: true };
  } catch {
    return { ref, logged: false };
  }
}

async function dayFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => FILE_RE.test(f));
  } catch {
    return [];
  }
}

/** Find an error by its reference, scanning the daily files newest first. */
export async function findError(
  ref: string,
  opts: Pick<ErrorLogOptions, 'logsDir'> = {},
): Promise<ErrorRecord | null> {
  if (!isErrorRef(ref)) return null;
  const dir = opts.logsDir ?? DEFAULT_LOGS_DIR;
  const files = (await dayFiles(dir)).sort().reverse();
  for (const f of files) {
    let text: string;
    try {
      text = await readFile(join(dir, f), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line.includes(ref)) continue;
      try {
        const rec = JSON.parse(line) as ErrorRecord;
        if (rec.ref === ref) return rec;
      } catch {
        // skip a damaged line
      }
    }
  }
  return null;
}

/**
 * Remove daily files older than {@link RETENTION_DAYS} (by the date in the file name). Call on
 * service start. Never throws; returns the names removed.
 */
export async function sweepErrorLogs(
  opts: Pick<ErrorLogOptions, 'logsDir' | 'now'> = {},
): Promise<string[]> {
  const dir = opts.logsDir ?? DEFAULT_LOGS_DIR;
  const cutoff = dayOf(new Date((opts.now ?? new Date()).getTime() - RETENTION_DAYS * 86_400_000));
  const removed: string[] = [];
  for (const f of await dayFiles(dir)) {
    if (f.slice(0, 10) < cutoff) {
      try {
        await unlink(join(dir, f));
        removed.push(f);
      } catch {
        // leave it for the next start
      }
    }
  }
  return removed;
}
