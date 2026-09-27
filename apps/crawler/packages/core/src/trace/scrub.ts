import { isSensitiveKey, maskText, scrubJson } from '../pii.js';

/**
 * `scrubJson` masks every UUID and sha256 as `[token]`, which would erase the run, action, state and
 * frontier ids a trace exists to show. Values under id-like keys that are exactly a UUID or a hex
 * hash (optionally `.ext`) are server-issued references, not secrets, and are kept (research §7).
 */
const ID_KEY =
  /^(?:id|ids|[a-z0-9_]+_ids?|evidence_ref|payload_ref|level1|matched|fingerprint|matched_fingerprint|overlapping_calls)$/i;
const ID_VALUE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64}(?:\.[a-z0-9]{1,8})?)$/i;

const keepsIds = (key: string): boolean => ID_KEY.test(key) && !isSensitiveKey(key);

function scrubUnder(key: string, value: unknown): unknown {
  if (keepsIds(key)) {
    if (typeof value === 'string' && ID_VALUE.test(value)) return value;
    if (Array.isArray(value)) return value.map((v) => scrubUnder(key, v));
  }
  if (value !== null && typeof value === 'object') return scrubTraceJson(value);
  return (scrubJson({ [key]: value }) as Record<string, unknown>)[key];
}

export function scrubTraceJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubTraceJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubUnder(k, v)]));
  }
  return scrubJson(value);
}

/** Text that is JSON (tool results) is scrubbed structurally so ids survive; anything else masked. */
export function scrubTraceText(text: string): string {
  const t = text.trimStart();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.stringify(scrubTraceJson(JSON.parse(text)));
    } catch {
      // not JSON after all
    }
  }
  return maskText(text);
}
