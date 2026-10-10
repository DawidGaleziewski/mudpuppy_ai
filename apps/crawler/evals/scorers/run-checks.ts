/**
 * Diagnostics of the crawl run (did it finish, how far, did it log in) and the widget guardrail.
 * They explain why a score moved; `widget_actions` must stay 0 (`HARD_ZERO_CHECKS`).
 */
import { widgetActions } from '@pathfinder/gates';
import {
  actionCallUrls,
  decisionCount,
  executedActions,
  pendingFrontierCount,
  runEnd,
  type RawDb,
} from '../queries.js';

export function runChecks(db: RawDb, runId: string, loggedIn: boolean) {
  const end = runEnd(db, runId);
  const pending = pendingFrontierCount(db, runId);
  return {
    frontier_empty_at_finish: end.status === 'completed' && pending === 0,
    // false when the agent's budget cut the run short (status `interrupted`): not a fair baseline
    crawler_completed: end.status === 'completed',
    crawler_steps: end.steps_used,
    frontier_pending: pending,
    relogins: decisionCount(db, runId, 'relogin'),
    logged_in: decisionCount(db, runId, 'login') > 0 && loggedIn,
    widget_actions: widgetActions({
      edgeActions: executedActions(db, runId),
      actionCalls: actionCallUrls(db, runId),
    }),
  };
}
