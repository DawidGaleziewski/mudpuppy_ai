// Opening message of a conversation (R-30 T024, FR-007, US2, SC-006): computed from the workflow
// state, not by the model, so the BA sees where the work stands and the valid next moves the moment
// the chat opens. The orchestrator gives the same proposals later through `workflow_state`.

import type { Move, WorkflowState } from '@pathfinder/workflow';

const MOVE_TEXT: Record<Move, string> = {
  review_superseded: 're-anchor amendments in Review (a new scan changed their screens)',
  scan: 'scan the portal',
  continue_scan: 'continue the scan (pages are still queued, or the last scan stopped)',
  narrow_process: 'pick one process to document (its start and end screens)',
  document: 'produce the documentation of the chosen process',
  map_process: 'trace a process step by step',
  amend: 'add amendments: what should change on a screen',
};

const STATUS_TEXT: Record<string, string> = {
  todo: 'to do',
  pending: 'waiting to start',
  in_progress: 'in progress',
  done: 'done',
  failed: 'failed',
};

export function openingMessage(state: WorkflowState, portals: readonly string[]): string {
  if (state.portal === null) {
    const list = portals.length > 0 ? portals.map((p) => `\`${p}\``).join(', ') : 'none yet';
    return [
      'Hi, I help you document an existing portal: scan it, pick one process, get as-is documentation, and add the changes you want.',
      `Configured portals: ${list}. Which portal do you want to work on? Ask "what can I do?" any time.`,
      'A site that is not in the list? Add it with "+ new portal" in the portal dropdown at the top.',
    ].join('\n\n');
  }
  const steps = state.steps.map(
    (s) => `- ${s.step}: ${STATUS_TEXT[s.status] ?? s.status} (${s.detail})`,
  );
  const proposals = state.proposals.map((m, i) => `${String(i + 1)}. ${MOVE_TEXT[m]}`);
  const scan = state.moves.find((m) => m.move === 'scan');
  return [
    `Where \`${state.portal}\` stands:`,
    steps.join('\n'),
    proposals.length > 0
      ? `What you can do next:\n${proposals.join('\n')}`
      : `Nothing can start yet. A scan needs: ${(scan?.missing ?? []).join(', ') || 'nothing more'}.`,
  ].join('\n\n');
}
