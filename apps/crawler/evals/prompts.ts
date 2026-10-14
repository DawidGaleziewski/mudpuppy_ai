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
  ba: (portal: string, runId: string, traceRunIds: readonly string[] = []) =>
    traceRunIds.length === 0
      ? `Document the portal "${portal}" from the recorded map run ${runId}: start one analysis session over that run, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`
      : `Document the portal "${portal}" from the recorded map run ${runId} and the trace runs ${traceRunIds.join(', ')}: start one analysis session over all of these runs, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`,
};
