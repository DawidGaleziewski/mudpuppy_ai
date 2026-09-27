import type { EvidenceStore } from '../evidence.js';
import { maskText } from '../pii.js';
import { scrubTraceJson } from './scrub.js';

export interface FittedPayload {
  inline: unknown;
  /** Evidence file holding the full scrubbed value when it did not fit inline. */
  payload_ref?: string;
  truncated: boolean;
}

const PREVIEW_ITEMS = 5;
const PREVIEW_CHARS = 200;
const PREVIEW_DEPTH = 3;

const bytes = (v: unknown): number => Buffer.byteLength(JSON.stringify(v) ?? 'null', 'utf8');

function preview(v: unknown, depth: number): unknown {
  if (typeof v === 'string') return v.length > PREVIEW_CHARS ? `${v.slice(0, PREVIEW_CHARS)}…` : v;
  if (Array.isArray(v)) {
    const head = v.slice(0, PREVIEW_ITEMS).map((x) => preview(x, depth + 1));
    if (v.length > PREVIEW_ITEMS) head.push(`… ${v.length - PREVIEW_ITEMS} more`);
    return head;
  }
  if (v !== null && typeof v === 'object') {
    if (depth >= PREVIEW_DEPTH) return '[…]';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, preview(x, depth + 1)]));
  }
  return v;
}

function keysOnly(v: unknown, cap: number): unknown {
  const out: { _truncated: true; keys?: string[] } = { _truncated: true };
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return out;
  const keys: string[] = [];
  for (const k of Object.keys(v)) {
    if (bytes({ ...out, keys: [...keys, k] }) > cap) break;
    keys.push(k);
  }
  return keys.length ? { ...out, keys } : out;
}

/**
 * Scrub a span payload and keep it under `inlineBytes`; anything larger goes to the evidence store
 * whole and a bounded preview stays inline (research §6). Never throws on the value itself.
 */
export async function fitPayload(
  value: unknown,
  opts: { store: Pick<EvidenceStore, 'storeJson'>; inlineBytes?: number },
): Promise<FittedPayload> {
  const cap = opts.inlineBytes ?? 8192;
  if (value === undefined) return { inline: null, truncated: false };
  let scrubbed: unknown;
  let size: number;
  try {
    scrubbed = scrubTraceJson(value);
    size = bytes(scrubbed);
  } catch {
    return { inline: { _unserializable: true }, truncated: true };
  }
  if (size <= cap) return { inline: scrubbed, truncated: false };
  const payload_ref = await opts.store.storeJson(scrubbed, scrubTraceJson);
  const p = preview(scrubbed, 0);
  return { inline: bytes(p) <= cap ? p : keysOnly(scrubbed, cap), payload_ref, truncated: true };
}

/** Mask free text and cut it to `max` UTF-16 units, ending in `…` when cut. */
export function fitText(text: string, max = 4096): { text: string; truncated: boolean } {
  const masked = maskText(text);
  if (masked.length <= max) return { text: masked, truncated: false };
  let head = masked.slice(0, max - 1);
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1);
  return { text: `${head}…`, truncated: true };
}
