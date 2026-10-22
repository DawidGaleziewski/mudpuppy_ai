// The crawler briefs `request_scan` hands over (R-30 T015; spec 011, spec 032 US5, spec 034 R-66).

import type { z } from 'zod';
import { directedPrompt } from './scan-directed.js';
import type { DirectedType, ScanFocus, ScanPlan } from './scan.js';

/** What the scan may do, as told to the crawler; undefined keeps a resumed run's own. */
export interface ScanChoices {
  allowWrites?: boolean;
  skipImages?: boolean;
  focus?: z.infer<typeof ScanFocus>;
}

export function briefFor(
  s: {
    portal: string;
    persona: string;
    environment: string;
    resume_run_id: string | undefined;
    process: { name: string; goal: string } | undefined;
    probe: boolean;
    run_type: DirectedType | undefined;
    plan: ScanPlan | undefined;
  },
  choices: ScanChoices,
): string {
  if (s.run_type !== undefined)
    return directedPrompt(
      { portal: s.portal, persona: s.persona, environment: s.environment },
      s.run_type,
      s.plan ?? {},
      choiceArgs(choices),
    );
  if (s.probe) return probePrompt(s.portal, s.persona, s.environment, choices);
  if (s.process !== undefined)
    return tracePrompt(s.portal, s.persona, s.environment, s.process, choices);
  return scanPrompt(s.portal, s.persona, s.environment, s.resume_run_id, choices);
}

/** The crawler brief for a "Probe forms" scan (spec 032 US5). */
export function probePrompt(
  portal: string,
  persona: string,
  environment: string,
  choices: ScanChoices = {},
): string {
  return (
    `Probe the marked forms of portal "${portal}" as persona "${persona}" in environment ` +
    `"${environment}" (a form-probing scan): call start_run with form_probing true and environment ` +
    `"${environment}".${choiceArgs(choices)} Use only the mudpuppy tools. Follow the "Probe forms" ` +
    'procedure: for each of the probe_marks start_run returns, open its URL, press on with Next ' +
    'until the marked step shows, then call probe_form on that step\'s submit or Next until its ' +
    'result has no "more". Do not follow the frontier. Then finish_run. Stop early only on ' +
    'RUN_STOPPED or a refusal to start, and report its message word for word. Finish with the run ' +
    'id, its status, and per mark the step and how many outcomes it got.'
  );
}

/** The `start_run` arguments for the BA's choices, as text for the crawler brief. */
function choiceArgs(choices: ScanChoices): string {
  const args: string[] = [];
  if (choices.allowWrites !== undefined)
    args.push(
      choices.allowWrites
        ? 'max_action_class "external-side-effect"'
        : // Not "no form is filled": a trace briefed so refused to type in an allowed search
          // box (spec 011 F-10). The server enforces the limit; searching stays allowed.
          'max_action_class "read" (the server refuses anything that would change data; act on every action it marks allowed, searching included)',
    );
  if (choices.skipImages !== undefined) args.push(`skip_images ${String(choices.skipImages)}`);
  if (choices.focus !== undefined) args.push(`focus ${JSON.stringify(choices.focus)}`);
  return args.length === 0 ? '' : ` Also pass ${args.join(' and ')}.`;
}

/** The crawler brief for the "map a process" step: one trace run (spec 011 FR-019). */
export function tracePrompt(
  portal: string,
  persona: string,
  environment: string,
  process: { name: string; goal: string },
  choices: ScanChoices = {},
): string {
  return (
    `Trace the process ${JSON.stringify(process.name)} of portal "${portal}" as persona "${persona}" ` +
    `in environment "${environment}": call start_run with mode "trace", process ` +
    `${JSON.stringify(process)} and environment "${environment}".${choiceArgs(choices)} ` +
    'Use only the mudpuppy tools. Start at the base_url start_run returns, walk only this ' +
    'process toward its goal and finish_run when the goal is reached or cannot be. Stop early only ' +
    'on RUN_STOPPED or a refusal to start, and report its message word for word. Finish with the ' +
    'run id, its status and how the process ended.'
  );
}

/**
 * The crawler brief. "Drain the frontier" is spelled out because a crawler briefed without it
 * stopped after 33 steps with 220 links queued, judging them duplicates (F-13, T042).
 */
export function scanPrompt(
  portal: string,
  persona: string,
  environment: string,
  resumeRunId?: string,
  choices: ScanChoices = {},
): string {
  const start =
    (resumeRunId === undefined
      ? `Map portal "${portal}" as persona "${persona}" in environment "${environment}" (a new map run): call start_run with environment "${environment}".`
      : `Resume the stopped map run ${resumeRunId} of portal "${portal}" as persona "${persona}" in environment "${environment}": call start_run with resume_run_id "${resumeRunId}" and environment "${environment}".`) +
    choiceArgs(choices);
  return (
    `${start} Use only the mudpuppy tools. Drain the frontier by acting on each result's next item ` +
    '(or get_next_frontier_item when a result has none) until there is no next item. Only then call ' +
    'finish_run; if it answers FRONTIER_NOT_EMPTY, continue. Stop early only on RUN_STOPPED or a ' +
    'refusal to start, and report its message word for word. Finish with the run id, its status ' +
    'and the worklist of what you skipped.'
  );
}
