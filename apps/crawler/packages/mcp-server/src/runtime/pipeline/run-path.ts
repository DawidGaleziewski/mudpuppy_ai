import type { PathStep, RunState } from '../run-state.js';

/**
 * How the run reached each state (spec 032 plan decision 4): a `navigate` starts a path at its URL;
 * an `act` extends the path of the state it was taken on. The shortest path is kept. A state
 * reached otherwise (login, re-login) has no path until a navigate or act reaches it.
 */
export function pathByNavigate(rs: RunState, stateId: string, url: string): void {
  const known = rs.pathTo.get(stateId);
  if (known === undefined || known.steps.length > 0) rs.pathTo.set(stateId, { url, steps: [] });
}

export function pathByAct(rs: RunState, from: string, to: string, step: PathStep): void {
  if (from === to) return;
  const base = rs.pathTo.get(from);
  if (base === undefined) return;
  const known = rs.pathTo.get(to);
  if (known !== undefined && known.steps.length <= base.steps.length + 1) return;
  rs.pathTo.set(to, { url: base.url, steps: [...base.steps, step] });
}
