/**
 * What the assistant is asked (spec 038 FR-002): exactly what "Ask the assistant to regroup" on
 * Processes says, after the handover block the chat service sends in a fresh session. How to
 * group stays in the orchestrator's agent file; the eval does not coach it.
 */

export const REGROUP = 'Cut this portal into processes and suggest groupings';

export function regroupPrompt(portal: string): string {
  return [
    'This is a new session of this conversation.',
    `Portal: ${portal}.`,
    '',
    "BA's message:",
    REGROUP,
  ].join('\n');
}
