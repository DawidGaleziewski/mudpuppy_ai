// Command cards as the dashboard drives them (spec 043 T016, FR-010): a card opened from a button,
// a fresh token per card shown, Confirm, Cancel, and the timer's settle. Each change is told to the
// conversation (a `wb_command` event) and logged (`wb_cmd`). The rules are in workbench-commands.ts.

import { createCommandChecker, loadContract } from '@mudpuppy/workbench-contract';
import type { ChatEvent } from './events.js';
import { HttpError } from './http-error.js';
import {
  cancelCommand,
  CommandRefusal,
  confirmCommand,
  issueToken,
  proposeCommand,
  undoCommand,
  type CommandRow,
} from './workbench-commands.js';
import { failStarts, settleCommands } from './workbench-settle.js';
import { asText, workbenchPortal, type Body, type WorkbenchDeps } from './workbench-service.js';
import { liveConfirmedText } from './workbench-live.js';
import { currentTurn } from './workbench-turn.js';

const contract = loadContract();
const checkCommand = createCommandChecker(contract);

const STATUS: Record<CommandRefusal['code'], number> = {
  NOT_FOUND: 404,
  BAD_TOKEN: 403,
  NOT_PROPOSED: 409,
  EXPIRED: 409,
  PRECONDITION: 409,
  NOT_IN_PHASE: 409,
  PAUSED: 409,
};

/** What the assistant gets when a person confirms a scan command (D-5): the fact, then the work. */
export function launchText(label: string, prompt: string): string {
  return `[event] The person confirmed: ${label}.\n\nStart the crawler agent with exactly this prompt:\n\n${prompt}`;
}

function refusing<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof CommandRefusal)) throw error;
    const text = `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`;
    throw new HttpError(STATUS[error.code], text);
  }
}

const labelOf = (command: CommandRow): string =>
  contract.commands.find((c) => c.name === command.command)?.label ?? command.command;

/** Hand a confirmed scan over: to the scan runner for a live conversation, else to its assistant. */
function launcher(deps: WorkbenchDeps) {
  return (conversationId: string, prompt: string, command: CommandRow): void => {
    deps.launches.allow(conversationId, prompt);
    const text = launchText(labelOf(command), prompt);
    // A failed hand-off is caught by the timer: no run starts, the command fails.
    if (deps.runner !== undefined && deps.live?.(conversationId) === true) {
      // spec 075: the scan runs in the background; the live assistant is only told
      deps.runner.run(conversationId, text).catch(() => undefined);
      deps.service.sendEvent(conversationId, liveConfirmedText(labelOf(command))).catch(() => undefined);
      return;
    }
    deps.service.sendEvent(conversationId, text).catch(() => undefined);
  };
}

/** The live assistant hears of a persona the person added (by name only). */
function tellAdded(deps: WorkbenchDeps, row: CommandRow): void {
  if (row.command !== 'persona.add' || row.state !== 'done' || deps.live?.(row.conversation_id) !== true) return;
  const name = (JSON.parse(row.args_json) as { name?: unknown }).name;
  deps.service
    .sendEvent(row.conversation_id, `[event] The person added the persona ${String(name)}.`)
    .catch(() => undefined);
}

export function cardActions(deps: WorkbenchDeps) {
  const { raw, service } = deps;
  const tell = (row: CommandRow): void => {
    const event: ChatEvent = { type: 'wb_command', id: row.id, state: row.state };
    service.inject(row.conversation_id, [event]);
    deps.telemetry('wb_cmd', { cmd: row.command, source: row.source, state: row.state });
  };
  const launch = launcher(deps);

  return {
    /** A card the person opened from a view's button (`source: 'button'`). */
    proposeFromButton(body: Body): { id: string } {
      const id = asText(body.conversation_id, 'conversation_id', 64);
      const portal = workbenchPortal(raw, id);
      const checked = checkCommand({
        command: body.command,
        args: body.args,
        reason: 'From the view.',
      });
      if (!checked.ok) throw new HttpError(400, `The command is ${checked.code}.`);
      const turn = Number.isInteger(body.turn) ? Number(body.turn) : currentTurn(raw, id);
      const row = refusing(() =>
        proposeCommand(raw, {
          conversationId: id,
          turn,
          proposal: checked.proposal,
          source: 'button',
          portal,
        }),
      );
      tell(row);
      return { id: row.id };
    },

    token: (id: string): { token: string } => ({ token: refusing(() => issueToken(raw, id)) }),

    confirm(id: string, body: Body): { state: string } {
      const input = {
        id,
        token: asText(body.token, 'token', 200),
        by: asText(body.by, 'by', 100),
        // The persona the person picked on a Start card (spec 044); checked when the scan starts.
        ...(typeof body.persona === 'string' && body.persona !== ''
          ? { persona: asText(body.persona, 'persona', 64) }
          : {}),
        // An editable card's fields as the person left them (persona.add, spec 072).
        ...(typeof body.args === 'object' && body.args !== null && !Array.isArray(body.args)
          ? { args: body.args as Record<string, unknown> }
          : {}),
      };
      const confirmDeps = {
        raw,
        paths: deps.paths,
        commandsOn: deps.commandsOn?.() ?? true,
        ...(deps.offReason === undefined ? {} : { offReason: deps.offReason }),
        launch,
        ...(deps.stopped === undefined ? {} : { stopped: deps.stopped }),
      };
      const row = refusing(() => confirmCommand(confirmDeps, input));
      tell(row);
      tellAdded(deps, row);
      return { state: row.state };
    },

    cancel(id: string): { state: string } {
      const row = refusing(() => cancelCommand(raw, id));
      tell(row);
      return { state: row.state };
    },

    /** Undo a done persona.add (designer 19/04), while no scan used the persona. */
    undo(id: string): { state: string } {
      const row = refusing(() => undoCommand(raw, deps.paths, id));
      tell(row);
      return { state: row.state };
    },

    /** The timer's pass: expired proposals, confirmed scans whose run started or never did. */
    settle(): void {
      for (const row of settleCommands(raw)) tell(row);
    },

    /** The step recorder's events: a scan step that failed before its run fails its start. */
    stepEvents(conversationId: string, events: readonly ChatEvent[]): void {
      for (const row of failStarts(raw, conversationId, events)) tell(row);
    },
  };
}
