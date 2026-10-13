// ACP client for the orchestrator session (R-30 T012, research.md R1/R2).
// Connects to an ACP agent (the Claude adapter in production, a fake in tests), opens one session,
// turns session updates into chat events, and routes every permission request through the fence.

import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as acp from '@agentclientprotocol/sdk';
import type { ErrorInput, LogResult } from './error-log.js';
import type { ChatEvent, ChatEventListener } from './events.js';
import { uiActionOf } from './ui-actions.js';

export interface PermissionQuery {
  toolCallId: string;
  /** Claude tool name (`Agent`, `mcp__pathfinder-chat__workflow_state`, `Bash`, ...) when known. */
  tool: string | null;
  title: string;
  /** Tool call of the `crawler`/`ba` subagent that made this call, if any. */
  parentToolCallId: string | null;
  /** Subagent type of that parent call (`crawler`, `ba`), when the parent was an Agent call. */
  parentAgent: string | null;
  rawInput: unknown;
}

export interface PermissionDecision {
  allow: boolean;
  reason: string;
}

export type PermissionPolicy = (query: PermissionQuery) => PermissionDecision;

/** A live link to an agent: the client connection plus a way to stop the agent process. */
export interface AgentLink {
  connection: acp.ClientConnection;
  stop: () => void;
}

export type AgentLauncher = (app: acp.ClientApp) => AgentLink;

/** Path of the Claude ACP adapter's entry script (package bin `claude-agent-acp`). */
export function claudeAgentEntry(): string {
  return fileURLToPath(import.meta.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js'));
}

/** Launch the Claude ACP adapter as a child process speaking ndjson over stdio. */
export function spawnClaudeAgent(opts: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onStderr?: (text: string) => void;
}): AgentLauncher {
  return (app) => {
    const child = spawn(process.execPath, [claudeAgentEntry()], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text: string) => opts.onStderr?.(text));
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const connection = app.connect(stream);
    child.on('exit', () => {
      connection.close(new Error('agent process exited'));
    });
    return {
      connection,
      stop: () => {
        connection.close();
        if (child.exitCode === null) child.kill('SIGTERM');
      },
    };
  };
}

export interface AcpChatOptions {
  launch: AgentLauncher;
  /** Full `session/new` request: cwd, MCP servers and `_meta.claudeCode.options`. */
  session: acp.NewSessionRequest;
  policy: PermissionPolicy;
  onEvent: ChatEventListener;
  logError: (input: ErrorInput) => Promise<LogResult>;
  conversationId?: string | null;
  /** A prompt turn that runs longer is cancelled and reported. Default 30 minutes (scans run long). */
  turnTimeoutMs?: number;
}

interface ToolInfo {
  tool: string | null;
  parentToolCallId: string | null;
  /** `subagent_type` of an Agent call, so its children can be judged by their parent. */
  subagent: string | null;
  /** The call's input as last seen (it can stream in after `tool_call`); for UI actions. */
  input: unknown;
}

interface ClaudeMeta {
  toolName?: string;
  parentToolUseId?: string;
}

function claudeMeta(meta: unknown): ClaudeMeta {
  if (typeof meta !== 'object' || meta === null) return {};
  const cc = (meta as { claudeCode?: unknown }).claudeCode;
  if (typeof cc !== 'object' || cc === null) return {};
  const { toolName, parentToolUseId } = cc as Record<string, unknown>;
  return {
    ...(typeof toolName === 'string' ? { toolName } : {}),
    ...(typeof parentToolUseId === 'string' ? { parentToolUseId } : {}),
  };
}

/**
 * True when an `Agent` call's result only says the subagent was launched to run in the background
 * (seen with claude-agent-acp 0.85.1, findings F-17): the subagent is still working.
 */
export function launchedInBackground(update: { content?: unknown; rawOutput?: unknown }): boolean {
  const text = JSON.stringify([update.content ?? null, update.rawOutput ?? null]);
  return text.includes('Async agent launched');
}

function subagentOf(rawInput: unknown): string | null {
  if (typeof rawInput !== 'object' || rawInput === null) return null;
  const type = (rawInput as { subagent_type?: unknown }).subagent_type;
  return typeof type === 'string' ? type : null;
}

const DEFAULT_TURN_TIMEOUT_MS = 30 * 60 * 1000;

// Claude Code's usage-limit text, e.g. "You've hit your weekly limit · resets 9pm (Europe/Warsaw)".
const USAGE_LIMIT = /hit your [\w\s-]*limit|usage limit|rate[ _-]?limit|\b429\b/i;
const LIMIT_RESET = /resets ([^\n]+?)\s*$/im;

/** What the BA sees when a prompt fails: a usage limit is named plainly, with its reset time (F-21). */
export function promptFailureMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (!USAGE_LIMIT.test(text)) return 'The assistant stopped unexpectedly.';
  const reset = LIMIT_RESET.exec(text)?.[1];
  return reset === undefined
    ? 'The assistant has used up its Claude usage limit. Try again later.'
    : `The assistant has used up its Claude usage limit. It resets ${reset}; try again then.`;
}

export class AcpChat {
  private link: AgentLink | null = null;
  private session: acp.ActiveSession | null = null;
  private readonly tools = new Map<string, ToolInfo>();
  /** This turn already said something, and a tool ran since: the next text starts a new paragraph. */
  private textInTurn = false;
  private toolSinceText = false;
  private closing = false;
  private turnActive = false;
  /** Restarts the running turn's silence timeout; null outside a turn. */
  private bump: (() => void) | null = null;

  constructor(private readonly opts: AcpChatOptions) {}

  get sessionId(): string | null {
    return this.session?.sessionId ?? null;
  }

  get alive(): boolean {
    return this.link !== null && !this.link.connection.signal.aborted;
  }

  get busy(): boolean {
    return this.turnActive;
  }

  /** Connect, initialize and open the session. Returns the ACP session id. */
  async start(): Promise<string> {
    const app = acp
      .client({ name: 'pathfinder-chat' })
      .onRequest(acp.methods.client.session.requestPermission, (ctx) =>
        this.onPermission(ctx.params),
      );
    const link = this.opts.launch(app);
    this.link = link;
    void link.connection.closed.then(() => this.onClosed());
    try {
      await link.connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'pathfinder-chat', version: '0.0.0' },
      });
      const session = await link.connection.agent.buildSession(this.opts.session).start();
      this.session = session;
      void this.pump(session);
      return session.sessionId;
    } catch (error) {
      await this.fail('acp-client start', 'The assistant could not be started.', error);
      throw error;
    }
  }

  /** Send one BA message and resolve with the stop reason when the turn ends. */
  async prompt(text: string): Promise<acp.StopReason> {
    const session = this.session;
    if (session === null || !this.alive) {
      await this.fail('acp-client prompt', 'The assistant is not running.', null);
      throw new Error('session not started');
    }
    if (this.turnActive) throw new Error('a turn is already running');
    this.turnActive = true;
    let timer: NodeJS.Timeout | undefined;
    const timeoutMs = this.opts.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    // A turn waits for its background subagents (a full scan takes ~30 min, F-20), so the limit
    // is on silence: every update or permission request from the agent restarts the clock.
    const timeout = new Promise<'timeout'>((resolve) => {
      this.bump = () => {
        clearTimeout(timer);
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      };
      this.bump();
    });
    try {
      const result = await Promise.race([session.prompt(text), timeout]);
      if (result === 'timeout') {
        await this.cancel();
        await this.fail('acp-client prompt', 'The assistant took too long and was stopped.', {
          timeoutMs,
        });
        return 'cancelled';
      }
      return result.stopReason;
    } catch (error) {
      if (!this.closing) await this.fail('acp-client prompt', promptFailureMessage(error), error);
      throw error;
    } finally {
      clearTimeout(timer);
      this.bump = null;
      this.turnActive = false;
    }
  }

  async cancel(): Promise<void> {
    const session = this.session;
    if (session === null || this.link === null || !this.alive) return;
    await this.link.connection.agent.notify(acp.methods.agent.session.cancel, {
      sessionId: session.sessionId,
    });
  }

  close(): void {
    this.closing = true;
    this.session?.dispose();
    this.link?.stop();
  }

  private emit(event: ChatEvent): void {
    this.opts.onEvent(event);
  }

  private async fail(where: string, message: string, detail: unknown): Promise<void> {
    const { ref, logged } = await this.opts.logError({
      conversation_id: this.opts.conversationId ?? null,
      where,
      message,
      detail,
    });
    this.emit({ type: 'error', ref, message, logged });
  }

  private async onClosed(): Promise<void> {
    if (this.closing) return;
    await this.fail('acp-client connection', 'The assistant stopped unexpectedly.', {
      reason: String(this.link?.connection.signal.reason ?? 'connection closed'),
    });
  }

  private async pump(session: acp.ActiveSession): Promise<void> {
    for (;;) {
      let message: acp.ActiveSessionMessage;
      try {
        message = await session.nextUpdate();
      } catch {
        return; // connection closed; onClosed reports it
      }
      if (message.kind === 'stop') {
        this.textInTurn = false;
        this.toolSinceText = false;
        this.emit({ type: 'message_done', stopReason: message.stopReason });
        this.emit({ type: 'idle' });
        continue;
      }
      this.onUpdate(message.update);
    }
  }

  private remember(
    toolCallId: string,
    meta: unknown,
    rawInput: unknown,
    fallbackTool: string | null,
  ): ToolInfo {
    const known = this.tools.get(toolCallId);
    const m = claudeMeta(meta);
    const info: ToolInfo = {
      tool: m.toolName ?? known?.tool ?? fallbackTool,
      parentToolCallId: m.parentToolUseId ?? known?.parentToolCallId ?? null,
      subagent: subagentOf(rawInput) ?? known?.subagent ?? null,
      input: rawInput ?? known?.input ?? null,
    };
    this.tools.set(toolCallId, info);
    return info;
  }

  /** A completed call of the assistant's browser tools becomes a `ui_action` (spec 022 R6). */
  private finished(info: ToolInfo, status: string | null | undefined): void {
    if (status !== 'completed') return;
    const action = uiActionOf(info.tool, info.input);
    if (action !== null) this.emit(action);
  }

  private onUpdate(update: acp.SessionUpdate): void {
    this.bump?.();
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content.type === 'text') {
          // Text blocks around tool calls arrive with no separator ("Resuming it.The scan", F-19).
          const lead = this.textInTurn && this.toolSinceText ? '\n\n' : '';
          this.textInTurn = true;
          this.toolSinceText = false;
          this.emit({ type: 'message_chunk', text: lead + update.content.text });
        }
        return;
      case 'tool_call': {
        this.toolSinceText = true;
        const info = this.remember(
          update.toolCallId,
          update._meta,
          update.rawInput,
          update.name ?? null,
        );
        this.emit({
          type: 'tool_started',
          toolCallId: update.toolCallId,
          tool: info.tool,
          title: update.title,
          parentToolCallId: info.parentToolCallId,
          agent: info.subagent,
        });
        if (update.status === 'completed' || update.status === 'failed')
          this.emit({
            type: 'tool_finished',
            toolCallId: update.toolCallId,
            tool: info.tool,
            status: update.status,
            parentToolCallId: info.parentToolCallId,
            agent: info.subagent,
            ...(launchedInBackground(update) ? { background: true } : {}),
          });
        this.finished(info, update.status);
        return;
      }
      case 'tool_call_update': {
        const info = this.remember(update.toolCallId, update._meta, update.rawInput, null);
        if (update.status === 'completed' || update.status === 'failed')
          this.emit({
            type: 'tool_finished',
            toolCallId: update.toolCallId,
            tool: info.tool,
            status: update.status,
            parentToolCallId: info.parentToolCallId,
            agent: info.subagent,
            ...(launchedInBackground(update) ? { background: true } : {}),
          });
        this.finished(info, update.status);
        return;
      }
      case 'plan':
        this.emit({
          type: 'plan',
          entries: update.entries.map((e) => ({ content: e.content, status: e.status })),
        });
        return;
      default:
        return;
    }
  }

  private onPermission(params: acp.RequestPermissionRequest): acp.RequestPermissionResponse {
    this.bump?.();
    const call = params.toolCall;
    const info = this.remember(call.toolCallId, call._meta, call.rawInput, null);
    const parent =
      info.parentToolCallId === null ? undefined : this.tools.get(info.parentToolCallId);
    const query: PermissionQuery = {
      toolCallId: call.toolCallId,
      tool: info.tool,
      title: call.title ?? info.tool ?? 'unknown tool',
      parentToolCallId: info.parentToolCallId,
      parentAgent: parent?.subagent ?? null,
      rawInput: call.rawInput,
    };
    let decision: PermissionDecision;
    try {
      decision = this.opts.policy(query);
    } catch (error) {
      decision = { allow: false, reason: `fence error: ${String(error)}` };
    }
    const wanted: acp.PermissionOptionKind = decision.allow ? 'allow_once' : 'reject_once';
    const option = params.options.find((o) => o.kind === wanted);
    if (!decision.allow)
      this.emit({ type: 'refused', tool: query.tool, title: query.title, reason: decision.reason });
    if (option === undefined) {
      // No matching option: an allow cannot be expressed safely, so cancel (= not run).
      return { outcome: { outcome: 'cancelled' } };
    }
    return { outcome: { outcome: 'selected', optionId: option.optionId } };
  }
}
