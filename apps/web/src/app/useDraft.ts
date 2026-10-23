import type { ProcessPage } from './api-process';
import { processesKey } from './api-processes';
import { useWrite, writes } from './api-write';
import type { RawStep } from './stepOps';

/**
 * The person's draft of the to-be model shown: `apply` runs one step operation on the steps as
 * stored and autosaves the result (spec 059 D-1: the draft is theirs alone, so it does not ask
 * first; Save, Discard and Rebase do). The page reloads with the saved draft.
 */
export function useDraft(d: ProcessPage) {
  const write = useWrite(processesKey(d.portal));
  const ed = d.editor;
  const apply = (change: (steps: RawStep[]) => RawStep[]) => {
    if (!ed?.editable) return;
    const steps = change(ed.steps);
    const base = ed.draft?.base_rev ?? d.model.rev;
    write.mutate(writes.draft(d.portal, d.id, d.model.label, 'draft', { base_rev: base, steps }));
  };
  let failed: string | null = null;
  if (write.error) failed = 'The dashboard did not answer; the draft was not saved.';
  else if (write.data && !write.data.ok) failed = write.data.message;
  return { apply, saving: write.isPending, failed, editable: Boolean(ed?.editable) };
}

/** What `useDraft` gives the editor's parts. */
export type Draft = ReturnType<typeof useDraft>;
