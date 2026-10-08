/** What a registered secret is replaced with wherever it would be stored. */
export const SECRET_MASK = '[secret]';

/** Values shorter than this are not registered: replacing "ab" everywhere would wreck evidence. */
export const MIN_SECRET_LENGTH = 4;

export interface Redactor {
  /** Register a value; its raw, URL-encoded and JSON-escaped forms are all replaced. */
  add(this: void, value: string): void;
  /** Closures, not `this` methods: safe to pass around as `r.redact`. */
  redact(this: void, text: string): string;
  /** Deep copy with every string (keys included) redacted. */
  redactJson<T>(this: void, value: T): T;
  readonly size: number;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The run-scoped secret redactor (research §6). It is applied at every write path: evidence,
 * network bodies, the decision log, trace spans, logs and tool results. A portal that echoes a
 * password is then caught before storage. Longest forms are matched first, so a value that
 * contains another is replaced whole.
 */
export function createRedactor(): Redactor {
  const forms = new Set<string>();
  let re: RegExp | null = null;
  const values = new Set<string>();

  const add = (value: string): void => {
    if (value.length < MIN_SECRET_LENGTH || values.has(value)) return;
    values.add(value);
    forms.add(value);
    forms.add(encodeURIComponent(value));
    // `+` for spaces in form bodies
    forms.add(encodeURIComponent(value).replace(/%20/g, '+'));
    forms.add(JSON.stringify(value).slice(1, -1));
    re = new RegExp(
      [...forms]
        .sort((a, b) => b.length - a.length)
        .map(escapeRe)
        .join('|'),
      'g',
    );
  };

  const redact = (text: string): string => (re === null ? text : text.replace(re, SECRET_MASK));

  const redactJson = <T>(value: T): T => {
    if (re === null) return value;
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') return redact(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v !== null && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [redact(k), walk(x)]));
      return v;
    };
    return walk(value) as T;
  };

  return {
    add,
    redact,
    redactJson,
    get size() {
      return values.size;
    },
  };
}

/**
 * The server's one redactor (spec 009 FR-019). `start_run` registers every resolved credential
 * here; the write choke points apply it: the Kysely plugin (every INSERT/UPDATE value), the
 * evidence store's text and JSON writes, the logger and the tool results. Values stay registered
 * for the life of the process, so a value echoed after its run ended is still caught.
 */
export const SECRETS: Redactor = createRedactor();
