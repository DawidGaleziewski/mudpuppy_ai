// A command proposal's shape check (designer doc 17 § 4.3): the full `command.schema.json`, with
// its per-command argument rules. Preconditions, permission and the scan checks are the command
// service's (apps/chat), not the contract's.

import Ajv2020 from 'ajv/dist/2020.js';

import type { CommandEntry, Contract } from './contract.js';

export type CommandName = 'scan.start' | 'scan.resume' | 'scan.stop' | 'path.attempt' | 'mark.add';

export interface CommandProposal {
  command: CommandName;
  args: Record<string, unknown>;
  reason: string;
}

export type CommandCheck =
  | { ok: true; proposal: CommandProposal; entry: CommandEntry }
  | { ok: false; code: 'unknown_command' | 'bad_args' | 'bad_reason' };

export function createCommandChecker(contract: Contract) {
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
  const full = ajv.compile(contract.command);
  const entries = new Map(contract.commands.map((c) => [c.name, c]));
  return function checkCommand(raw: unknown): CommandCheck {
    const name =
      typeof raw === 'object' && raw !== null ? (raw as { command?: unknown }).command : undefined;
    const entry = typeof name === 'string' ? entries.get(name) : undefined;
    if (entry === undefined) return { ok: false, code: 'unknown_command' };
    if (full(raw)) return { ok: true, proposal: raw as CommandProposal, entry };
    const reasonBad = (full.errors ?? []).some((e) => e.instancePath.startsWith('/reason'));
    return { ok: false, code: reasonBad ? 'bad_reason' : 'bad_args' };
  };
}

export type CommandChecker = ReturnType<typeof createCommandChecker>;
