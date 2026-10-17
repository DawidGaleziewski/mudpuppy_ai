// `request_documentation` with a process key (spec 034 R-70 (2)): update a documented process
// instead of rebuilding it. Field finding of the first live check (spec 034 F-08): the assistant
// could only hand the BA a process scope, so "update PROC-001" had no way through.

import type BetterSqlite3 from 'better-sqlite3';
import { ScopeRefusal } from './scope.js';
import { recordStep } from './steps.js';

export interface UpdateHandoff {
  step: 'document';
  status: 'pending';
  processKey: string;
  handoff: { agent: 'ba'; prompt: string };
}

const KEY = /^(PROC|PRC)-\d{3,}$/;

function processExists(raw: BetterSqlite3.Database, portal: string, key: string): boolean {
  if (key.startsWith('PROC-'))
    return (
      raw
        .prepare(
          "SELECT 1 FROM doc_records WHERE portal_id = ? AND key = ? AND kind = 'process' AND withdrawn = 0",
        )
        .get(portal, key) !== undefined
    );
  return (
    raw.prepare('SELECT 1 FROM ba_processes WHERE portal_id = ? AND key = ?').get(portal, key) !==
    undefined
  );
}

export function requestProcessUpdate(
  raw: BetterSqlite3.Database,
  conversationId: string,
  portal: string,
  processKey: string,
): UpdateHandoff {
  if (!KEY.test(processKey) || !processExists(raw, portal, processKey))
    throw new ScopeRefusal('NOT_FOUND', `no documented process ${processKey} for ${portal}`, [
      'a process record (PROC-…) or a workspace process (PRC-…) of this portal',
    ]);
  const running = raw
    .prepare(`SELECT id FROM analysis_sessions WHERE portal_id = ? AND status = 'running' LIMIT 1`)
    .get(portal) as { id: string } | undefined;
  if (running !== undefined)
    throw new ScopeRefusal(
      'INVALID',
      `documentation of ${portal} is already running (${running.id})`,
    );
  recordStep(raw, { conversationId, portalId: portal, step: 'document', status: 'pending' });
  return {
    step: 'document',
    status: 'pending',
    processKey,
    handoff: {
      agent: 'ba',
      prompt: [
        `Update the documentation of process ${processKey} of portal "${portal}"; do not rebuild it.`,
        `First call open_process_update with portal_id "${portal}" and key "${processKey}": it lists the process's records, every run of it (the new ones marked), the screens no record cites yet and the error pages.`,
        'Then start_session with all the run ids it lists, revise the listed records with what the new runs show (keep their evidence; leave something out only with "dropped" and a reason), create records for the uncited screens, and document error pages as error branches, never as the process.',
        'Finish with the session summary and the gaps.',
      ].join('\n'),
    },
  };
}
