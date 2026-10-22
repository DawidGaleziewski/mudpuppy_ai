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
  settleCommands,
  type CommandRow,
} from './workbench-commands.js';
import { asText, workbenchPortal, type Body, type WorkbenchDeps } from './workbench-service.js';
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

/** One line the assistant gets when a person confirms a scan command (D-5). */
export function launchText(label: string, prompt: string): string {
  return `[event] The person confirmed: ${label}. Start the crawler agent with exactly this prompt:\n\n${prompt}`;
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

export function cardActions(deps: WorkbenchDeps) {
  const { raw, service } = deps;
  const tell = (row: CommandRow): void => {
    const event: ChatEvent = { type: 'wb_command', id: row.id, state: row.state };
    service.inject(row.conversation_id, [event]);
    deps.telemetry('wb_cmd', { cmd: row.command, source: row.source, state: row.state });
  };
  const launch = (conversationId: string, prompt: string, command: CommandRow): void => {
    deps.launches.allow(conversationId, prompt);
    const label = contract.commands.find((c) => c.name === command.command)?.label;
    // A failed hand-off is caught by the timer: no run starts, the command fails.
    service
      .sendEvent(conversationId, launchText(label ?? command.command, prompt))
      .catch(() => undefined);
  };

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
      };
      const confirmDeps = {
        raw,
        paths: deps.paths,
        commandsOn: deps.commandsOn?.() ?? true,
        launch,
        ...(deps.stopped === undefined ? {} : { stopped: deps.stopped }),
      };
      const row = refusing(() => confirmCommand(confirmDeps, input));
      tell(row);
      return { state: row.state };
    },

    cancel(id: string): { state: string } {
      const row = refusing(() => cancelCommand(raw, id));
      tell(row);
      return { state: row.state };
    },

    /** The timer's pass: expired proposals, confirmed scans whose run started or never did. */
    settle(): void {
      for (const row of settleCommands(raw)) tell(row);
    },
  };
}
