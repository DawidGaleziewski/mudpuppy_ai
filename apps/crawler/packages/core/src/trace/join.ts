import type { ParsedTurn } from './transcript.js';

/** The fields of a `call` span the join needs. */
export interface CallSpanRef {
  id: string;
  run_id: string | null;
  tool_use_id: string | null;
  agent_id: string | null;
  name: string;
}

export interface JoinedTurn extends ParsedTurn {
  run_id: string | null;
  /** A `tool_use` row with a server call span. */
  matched: boolean;
}

export interface JoinResult {
  turns: JoinedTurn[];
  /** `mcp__pathfinder__*` calls the agent made that never reached the server. */
  unmatchedAgentCalls: JoinedTurn[];
  /** This agent's calls in the matched runs with no `tool_use` in the transcript. */
  unmatchedServerCalls: CallSpanRef[];
}

const PATHFINDER_TOOL = /^mcp__pathfinder__/;

/**
 * Join transcript rows to call spans by tool-use id (contracts/agent-import.md "Join"). Matched
 * `tool_use` rows anchor a run; a `tool_result` takes its call's run; every other row takes the
 * nearest following anchor's run, else the nearest preceding one.
 */
export function joinTurns(
  turns: readonly ParsedTurn[],
  spans: readonly CallSpanRef[],
  agentId: string | null,
): JoinResult {
  const byToolUse = new Map<string, CallSpanRef>();
  for (const s of spans) if (s.tool_use_id) byToolUse.set(s.tool_use_id, s);

  const out: JoinedTurn[] = turns.map((t) => {
    const s = t.tool_use_id ? byToolUse.get(t.tool_use_id) : undefined;
    const direct = s && (t.kind === 'tool_use' || t.kind === 'tool_result');
    return { ...t, run_id: direct ? s.run_id : null, matched: !!s && t.kind === 'tool_use' };
  });

  const anchor = (t: JoinedTurn): boolean => t.matched && t.run_id !== null;
  const following: (string | null)[] = new Array(out.length).fill(null);
  let next: string | null = null;
  for (let i = out.length - 1; i >= 0; i--) {
    following[i] = next;
    if (anchor(out[i]!)) next = out[i]!.run_id;
  }
  let prev: string | null = null;
  for (let i = 0; i < out.length; i++) {
    const t = out[i]!;
    const hasDirect = t.run_id !== null;
    if (!hasDirect) t.run_id = following[i] ?? prev;
    if (anchor(t)) prev = t.run_id;
  }

  const unmatchedAgentCalls = out.filter(
    (t) => t.kind === 'tool_use' && !t.matched && PATHFINDER_TOOL.test(t.tool_name ?? ''),
  );
  const seen = new Set(out.filter((t) => t.kind === 'tool_use').map((t) => t.tool_use_id));
  const runs = new Set(out.filter((t) => t.matched).map((t) => t.run_id));
  const unmatchedServerCalls =
    agentId === null
      ? []
      : spans.filter(
          (s) =>
            s.agent_id === agentId &&
            runs.has(s.run_id) &&
            (s.tool_use_id === null || !seen.has(s.tool_use_id)),
        );
  return { turns: out, unmatchedAgentCalls, unmatchedServerCalls };
}
