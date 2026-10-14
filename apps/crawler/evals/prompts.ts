/**
 * The task each agent gets. These only say *what* to do on this portal; *how* is in the agent
 * definitions (`.claude/agents/crawler.md`, `ba.md`) and the `ba-practice` skill, so a change in
 * behaviour usually belongs there. Changing a prompt changes what the baselines measured.
 */

export const PROMPTS = {
  crawler: (portal: string, persona: string) =>
    `Map the portal "${portal}" as persona "${persona}" in map mode, following your procedure until the frontier is empty or a budget ends. ${persona === 'guest' ? '' : 'Log in right after the first navigate.'} Report as your Return section says.`,
  crawlerTrace: (portal: string, persona: string, name: string, goal: string) =>
    `Trace the process "${name}" on the portal "${portal}" as persona "${persona}" in trace mode, following your Trace procedure. Goal: ${goal} ${persona === 'guest' ? '' : 'Log in right after the first navigate.'} Report as your Return section says.`,
  ba: (portal: string, runId: string) =>
    `Document the portal "${portal}" from the recorded map run ${runId}: start one analysis session over that run, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`,
  /**
   * The second BA session of a trial with process traces (spec 025 F-12, owner decision c): the
   * map session above stays as it was, so its scores compare with the map-only baselines.
   */
  baTraces: (portal: string, traceRunIds: readonly string[]) =>
    `The portal "${portal}" is already documented from its map run. Start one analysis session over the trace runs ${traceRunIds.join(', ')} only and do pass 3 (processes) as the ba-practice skill says: write the process and use_case records these traces show, linked to the screens, rules and data items already documented (list_records). Do not write or revise other kinds of record; add a followup if a trace shows something they miss. Finish the session. Report as your Return section says.`,
};
