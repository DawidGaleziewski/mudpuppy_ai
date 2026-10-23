// The console's writes (`web/api_writes.py`): each goes to the chat service through the dashboard,
// after the person confirmed it on the page (skill rule 8). One mutation hook for all of them: it
// posts, keeps the answer's message for the page to show and refreshes what the write changed.
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

/** The dashboard's answer to a write: whether it was recorded, what to tell the person, where to follow it up. */
export interface WriteResult {
  ok: boolean;
  message: string;
  href: string | null;
}

/** A write the page asks for: the API path and its JSON body. */
export interface Write {
  path: string;
  body: Record<string, unknown>;
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
  };
}

/** Post a write; when done, refresh the queries under `refresh` (the views the write changed). */
export function useWrite(refresh: QueryKey) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postJson,
    onSettled: () => client.invalidateQueries({ queryKey: refresh }),
  });
}

/** The writes, by what they do. */
export const writes = {
  mark: (state: string, kind: string, on: boolean): Write => ({
    path: `/api/states/${encodeURIComponent(state)}/marks`,
    body: { kind, action: on ? 'remove' : 'mark' },
  }),
  probe: (state: string, on: boolean): Write => ({
    path: `/api/states/${encodeURIComponent(state)}/probe-mark`,
    body: { action: on ? 'remove' : 'mark' },
  }),
  skip: (scan: string, transition: string): Write => ({
    path: `/api/scans/${encodeURIComponent(scan)}/skip`,
    body: { transition_id: transition },
  }),
  resume: (scan: string): Write => ({
    path: `/api/scans/${encodeURIComponent(scan)}/restart`,
    body: { run_type: 'continue' },
  }),
  retry: (scan: string, transition: string, variation: string): Write => ({
    path: `/api/scans/${encodeURIComponent(scan)}/restart`,
    body: { run_type: 'retry', transition_id: transition, variation },
  }),
  newProcess: (portal: string, name: string, persona: string, states: string[]): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes`,
    body: { name, persona, state_ids: states },
  }),
  unarchive: (portal: string, process: string, baseRev: number): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/unarchive`,
    body: { base_rev: baseRev },
  }),
  archive: (portal: string, process: string, baseRev: number): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/archive`,
    body: { base_rev: baseRev },
  }),
  stage: (portal: string, process: string, stage: string, baseRev: number): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/stage`,
    body: { stage, base_rev: baseRev },
  }),
  newModel: (portal: string, process: string, from: string): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/models`,
    body: { from },
  }),
  /** A's screens in their new order (one more, one less, or moved): a signed revision of A. */
  editAsIs: (portal: string, process: string, baseRev: number, states: string[]): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/models/A/edit`,
    body: { base_rev: baseRev, state_ids: states },
  }),
  /** The person's draft of a to-be model: autosave its steps, discard it, save it, rebase it. */
  draft: (portal: string, process: string, label: string, op: 'draft' | 'discard' | 'save' | 'rebase' | 'restore', body: Write['body'] = {}): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/models/${encodeURIComponent(label)}/${op}`,
    body,
  }),
  /** Save a pair's change spec as its next revision (lists are one item per line in the form). */
  changeSpec: (portal: string, process: string, body: Write['body']): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/change-spec`,
    body,
  }),
  markLive: (portal: string, process: string, environment: string, label: string, reason: string): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(process)}/live`,
    body: { environment, label, ...(reason ? { reason } : {}) },
  }),
  explore: (portal: string, processKey: string): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/check-runs`,
    body: { kind: 'explore', process_key: processKey },
  }),
  /** Accept, dismiss, split (`at`: the step the second half starts at) or merge (`with`). */
  suggestion: (portal: string, id: string, action: 'accept' | 'dismiss' | 'split' | 'merge', body: Record<string, string | number> = {}): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/suggestions/${encodeURIComponent(id)}/${action}`,
    body,
  }),
};
