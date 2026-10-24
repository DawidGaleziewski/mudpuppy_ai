// Start again (designer T-13, owner D-4, spec 079 FR-002): a scan start that failed before it
// created anything runs once more as it was confirmed (command, args with the persona, reason),
// confirmed by the person who presses it. The copy row names the failed one (`again_of`); its
// preconditions are checked anew, and a failed card starts again once.

import { nowIso } from '@mudpuppy/core';
import type { CommandProposal } from '@mudpuppy/workbench-contract';
import {
  CommandRefusal,
  getCommand,
  portalOf,
  prepare,
  proposeCommand,
  run,
  setCommandState,
  type CommandRow,
  type ConfirmDeps,
} from './workbench-commands.js';

const STARTS: ReadonlySet<string> = new Set(['scan.start', 'scan.resume']);
const COPIED = `SELECT 1 FROM workbench_commands WHERE json_extract(args_json, '$.again_of') = ?`;

export function againCommand(deps: ConfirmDeps, input: { id: string; by: string }): CommandRow {
  const { raw } = deps;
  if (deps.commandsOn === false)
    throw new CommandRefusal('PAUSED', deps.offReason ?? 'commands are paused');
  const failed = getCommand(raw, input.id);
  const result = JSON.parse(failed.result_json ?? '{}') as { run_id?: unknown };
  if (failed.state !== 'failed' || !STARTS.has(failed.command) || result.run_id !== undefined)
    throw new CommandRefusal('NOT_PROPOSED', 'only a scan that did not start can start again');
  if (raw.prepare(COPIED).get(failed.id) !== undefined)
    throw new CommandRefusal('NOT_PROPOSED', 'this scan was started again already');
  const args = JSON.parse(failed.args_json) as Record<string, unknown>;
  const proposal: CommandProposal = {
    command: failed.command,
    args: { ...args, again_of: failed.id },
    reason: failed.reason,
  };
  const portal = portalOf(raw, failed.conversation_id);
  const copy = proposeCommand(raw, {
    conversationId: failed.conversation_id,
    turn: failed.turn,
    proposal,
    source: 'button',
    portal,
  });
  setCommandState(raw, copy.id, 'running', { confirmed_by: input.by, confirmed_at: nowIso() });
  const persona = typeof args.persona === 'string' ? args.persona : undefined;
  run(deps, getCommand(raw, copy.id), prepare(raw, portal, proposal), persona);
  return getCommand(raw, copy.id);
}
