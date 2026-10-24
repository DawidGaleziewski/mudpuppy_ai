// The scan runner (spec 075 FR-002, the R-96 spike): a confirmed scan of a live Workbench
// conversation runs in an ACP session of its own, so the live assistant's turn ends at once and the
// person can talk to it while the crawler works (spec 043 F-19, D-5). The runner's only move is the
// Agent call the confirmed command allowed (the Workbench fence and `Launches`, F-10); its tool
// events go to the step recorder under the live conversation, so the command card settles as
// before (spec 073). Its words are not shown: the milestones tell the assistant what happened.

import type { NewSessionRequest } from '@agentclientprotocol/sdk';
import { AcpChat, type AgentLauncher, type PermissionPolicy } from './acp-client.js';
import type { ErrorInput, LogResult } from './error-log.js';
import type { ChatEvent } from './events.js';

/** The runner's whole prompt: one crawler, in the foreground, then one line. */
export const RUNNER_PROMPT = `You start one scan. The message gives a crawler prompt. Call the Agent tool once with subagent_type "crawler" and exactly that prompt; do not run it in the background. When it returns, answer with one line: how it ended. Do nothing else.`;

export interface ScanRunnerDeps {
  launch: AgentLauncher;
  /** The live conversation's session (its MCP servers and the crawler subagent), with the runner's prompt. */
  sessionRequest: (conversationId: string) => NewSessionRequest;
  /** The Workbench fence over the conversation's `Launches` (only the confirmed prompt starts). */
  policy: (conversationId: string) => PermissionPolicy;
  /** The runner's tool events (not its words), for the step recorder. */
  onEvent: (conversationId: string, event: ChatEvent) => void;
  logError: (input: ErrorInput) => Promise<LogResult>;
  /** Restarts on any update; the crawler's own calls keep it alive (default: AcpChat's). */
  turnTimeoutMs?: number;
}

/** The events the step recorder needs from a runner: its tool calls, and its end. */
const FORWARDED: ReadonlySet<ChatEvent['type']> = new Set(['tool_started', 'tool_finished', 'error']);

export class ScanRunner {
  private readonly running = new Map<string, AcpChat>();

  constructor(private readonly deps: ScanRunnerDeps) {}

  /** True while a runner works for the conversation. */
  busy(conversationId: string): boolean {
    return this.running.has(conversationId);
  }

  /**
   * Start the crawler for a confirmed command in the background; resolves when the runner's turn
   * ended (the crawler returned, failed or was stopped). `text` is the hand-off (`launchText`).
   */
  async run(conversationId: string, text: string): Promise<void> {
    if (this.running.has(conversationId)) throw new Error('a scan already runs for this conversation');
    const chat = new AcpChat({
      launch: this.deps.launch,
      session: this.deps.sessionRequest(conversationId),
      policy: this.deps.policy(conversationId),
      onEvent: (event) => {
        if (FORWARDED.has(event.type)) this.deps.onEvent(conversationId, event);
      },
      logError: this.deps.logError,
      conversationId,
      ...(this.deps.turnTimeoutMs === undefined ? {} : { turnTimeoutMs: this.deps.turnTimeoutMs }),
    });
    this.running.set(conversationId, chat);
    try {
      await chat.start();
      await chat.prompt(text);
    } catch {
      // AcpChat logged it and emitted an error event; the step recorder fails the step.
    } finally {
      this.running.delete(conversationId);
      // the runner's end is the subagent's end for the step recorder (its background launches)
      this.deps.onEvent(conversationId, { type: 'idle' });
      chat.close();
    }
  }

  /** Stop the runner of a conversation (the person's Stop); the run is stopped by its command. */
  async cancel(conversationId: string): Promise<void> {
    await this.running.get(conversationId)?.cancel();
  }

  close(): void {
    for (const chat of this.running.values()) chat.close();
    this.running.clear();
  }
}
