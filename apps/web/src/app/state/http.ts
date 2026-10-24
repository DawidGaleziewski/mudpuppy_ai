// Every `fetch` of the console (spec 076): a GET of JSON and a write's POST, which RTK Query's
// base query (`api.ts`) is built on, and the chat service's calls, which stay outside the cache.
// A GET keeps the chosen data store (spec 019) and, on a model page, As of (spec 040 FR-001).

import { currentAsOf, withAsOf } from '../asOf';
import { currentStore, withStore } from '../store';

/** A failed API call: the HTTP status and the API's own message, for the error state. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(withStore(withAsOf(path, currentAsOf()), currentStore()), { headers: { accept: 'application/json' } });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' ? body.detail : `${String(r.status)} ${r.statusText}`;
    throw new ApiError(r.status, detail);
  }
  return (await r.json()) as T;
}

/** The dashboard's answer to a write: whether it was recorded, what to tell the person, where to follow it up. */
export interface WriteResult {
  ok: boolean;
  message: string;
  href: string | null;
  /** A decision's command, which Undo takes back (Review). */
  undo?: string;
}

/** A write the page asks for: the API path and its JSON body. */
export interface Write {
  path: string;
  body: Record<string, unknown>;
}

/** The chat service's answer through the dashboard's `/chat/…` relay: a refusal's `message` and `ref`, a new conversation's `id`. */
export interface ChatAnswer {
  message?: string;
  ref?: string | null;
  id?: string;
}

/**
 * A call to the chat service (the dashboard's `/chat/…` relay): its status (0 when the dashboard
 * did not answer) and JSON answer. Not RTK Query on purpose: it is not the JSON API, a turn's
 * answer comes over the stream (`useChatStream`), and a credential's values must never be kept
 * in the store (only the vault holds them).
 */
export async function chatCall(path: string, body: unknown): Promise<{ status: number; answer: ChatAnswer }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    const answer = (await r.json().catch(() => ({}))) as ChatAnswer;
    return { status: r.status, answer };
  } catch {
    return { status: 0, answer: { message: 'The dashboard did not answer.' } };
  }
}

/**
 * A credential's values to the vault (spec 075 FR-009), at the conversation's credentials path:
 * null when stored, else why not. Shared by the assistant's credential card and the live persona card.
 */
export async function storeCredential(path: string, where: { portal: string; environment: string }, values: Record<string, string>): Promise<string | null> {
  const { status, answer } = await chatCall(path, { ...where, values });
  if (status >= 200 && status < 300) return null;
  return answer.message ?? `The vault did not take it (${String(status)}).`;
}

export async function postJson(w: Write): Promise<WriteResult> {
  const r = await fetch(w.path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(w.body),
  });
  const answer = (await r.json().catch(() => null)) as (Partial<WriteResult> & { detail?: unknown }) | null;
  // A write's own answer has a message; the dashboard's other errors (404, 422) a `detail`.
  const detail = typeof answer?.detail === 'string' ? answer.detail : null;
  return {
    ok: r.ok && answer?.ok === true,
    message: answer?.message ?? detail ?? `${String(r.status)} ${r.statusText}: the dashboard did not answer.`,
    href: answer?.href ?? null,
    ...(typeof answer?.undo === 'string' ? { undo: answer.undo } : {}),
  };
}
