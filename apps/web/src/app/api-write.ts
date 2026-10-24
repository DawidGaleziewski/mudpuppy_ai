// The console's writes (`web/api_writes.py`): each goes to the chat service through the dashboard,
// after the person confirmed it on the page (skill rule 8). One mutation hook for all of them: it
// posts, keeps the answer's message for the page to show and refreshes what the write changed.
import { useCallback } from 'react';
import { api } from './state/api';
import type { Write, WriteResult } from './state/http';

/** What a write's caller may run once its answer is in (an Edit first opens the new process). */
interface WriteCallbacks {
  onSuccess?: (result: WriteResult) => void;
  onSettled?: () => void;
}

/**
 * Post a write (RTK Query's `write` mutation, spec 076); when done, the views under `refresh`
 * (a key prefix) read again. `data` is the last answer, `isPending` while one is on its way.
 */
export function useWrite(refresh: readonly unknown[]) {
  const [trigger, state] = api.useWriteMutation();
  const mutate = useCallback(
    (write: Write, callbacks: WriteCallbacks = {}) => {
      trigger({ write, refresh })
        .unwrap()
        .then((r) => callbacks.onSuccess?.(r))
        .catch(() => undefined)
        .finally(() => callbacks.onSettled?.());
    },
    [trigger, refresh],
  );
  return { mutate, data: state.data, isPending: state.isLoading, error: state.error };
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
