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
  /** Spec 034 phase 9: probe the form steps the harness marked, as the owner marks them. */
  crawlerProbe: (portal: string, persona: string) =>
    `Probe the marked forms of the portal "${portal}" as persona "${persona}", following your Probe forms procedure. Report as your Return section says.`,
  /** With a form-probing run (spec 034 phase 9) the session covers it too; without one, as before. */
  ba: (portal: string, runId: string, probeRunId?: string) =>
    probeRunId
      ? `Document the portal "${portal}" from the recorded map run ${runId} and the form-probing run ${probeRunId}: start one analysis session over both runs, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`
      : `Document the portal "${portal}" from the recorded map run ${runId}: start one analysis session over that run, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`,
  /**
   * The second BA session of a trial with process traces (spec 025 F-12, owner decision c): the
   * map session above stays as it was, so its scores compare with the map-only baselines. The
   * trace runs are grouped into workspace processes first, as the owner groups them (F-20@034),
   * and the session updates the documentation the map session wrote instead of starting over.
   */
  baTraces: (portal: string, grouped: readonly { key: string; name: string; runId: string }[]) =>
    `The portal "${portal}" is already documented from its map run. Its trace runs are grouped into processes: ${grouped.map((g) => `${g.key} "${g.name}" (run ${g.runId})`).join(', ')}. Start one analysis session over these trace runs and do pass 3 (processes) as the ba-practice skill says, for each grouped process: call open_process_update for it, then revise the process record that already documents it or write one when none does, with its use_case, linked to the screens, rules and data items already documented (list_records). Do not write or revise other kinds of record; add a followup if a trace shows something they miss. Finish the session. Report as your Return section says.`,
};
