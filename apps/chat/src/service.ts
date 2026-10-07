// Chat service core (R-30 T014): one AcpChat per conversation, one turn at a time, an event bus
// with a replay buffer, and persistence of what the BA should see again after a reload.

import type { NewSessionRequest } from '@agentclientprotocol/sdk';
import type { ChatConversation, WorkflowStep } from '@pathfinder/core';
import { AcpChat, type AgentLauncher, type PermissionPolicy } from './acp-client.js';
import type { ErrorInput, LogResult } from './error-log.js';
import type { ChatEvent } from './events.js';
import { handover, promptWithHandover, type SessionKind } from './handover.js';
import type { ChatStore } from './store.js';

export const REPLAY_BUFFER_SIZE = 500;

/** An error with an HTTP status and a plain-language message for the BA. */
export class ChatError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface ChatServiceOptions {
  store: ChatStore;
  launch: AgentLauncher;
  sessionRequest: (conversationId: string) => NewSessionRequest;
  policy: PermissionPolicy;
  logError: (input: ErrorInput) => Promise<LogResult>;
  /** Passed to every AcpChat. */
  turnTimeoutMs?: number;
  /**
   * Called after each event is persisted; the events it returns (step changes) are published right
   * after it, in order. The step recorder (T022) plugs in here.
   */
  observe?: (conversationId: string, event: ChatEvent) => Promise<ChatEvent[]>;
  /** Opening message of a new conversation (T024), from the workflow state of its portal. */
  opening?: (portal: string | null, conversationId: string) => string;
}

export interface SequencedEvent {
  id: number;
  event: ChatEvent;
}

export type EventListener = (event: SequencedEvent) => void;

interface Runtime {
  chat: AcpChat | null;
  busy: boolean;
  /** True once an agent for this conversation died and has not been replaced yet. */
  needsRestart: boolean;
  nextId: number;
  buffer: SequencedEvent[];
  listeners: Set<EventListener>;
  /** Assistant text of the running turn. */
  text: string;
  /** Serialises persistence and publishing so events keep their order. */
  queue: Promise<void>;
  idleWaiters: (() => void)[];
}

export type AgentStatus = 'up' | 'down' | 'idle';

export class ChatService {
  private readonly runtimes = new Map<string, Runtime>();

  constructor(private readonly opts: ChatServiceOptions) {}

  async createConversation(input: {
    portal?: string | undefined;
    goal?: string | undefined;
    fresh?: boolean | undefined;
  }): Promise<{ conversation: ChatConversation; steps: WorkflowStep[] }> {
    const conversation = await this.opts.store.createOrResume({
      portal: input.portal ?? null,
      goal: input.goal ?? '',
      fresh: input.fresh === true,
    });
    if (this.opts.opening && (await this.opts.store.listMessages(conversation.id)).length === 0)
      await this.opts.store.appendMessage(conversation.id, {
        role: 'assistant',
        content: this.opts.opening(conversation.portal_id, conversation.id),
      });
    return { conversation, steps: await this.opts.store.listSteps(conversation.id) };
  }

  async exists(conversationId: string): Promise<boolean> {
    return (await this.opts.store.getConversation(conversationId)) !== null;
  }

  /** Persist the user message and start the turn in the background. */
  async send(conversationId: string, text: string): Promise<{ messageId: string }> {
    const conversation = await this.opts.store.getConversation(conversationId);
    if (conversation === null) throw new ChatError(404, 'This conversation does not exist.');
    const rt = this.runtime(conversationId);
    if (rt.busy)
      throw new ChatError(409, 'The assistant is still answering. Wait for it to finish.');
    rt.busy = true;
    try {
      const message = await this.opts.store.appendMessage(conversationId, {
        role: 'user',
        content: text,
      });
      void this.runTurn(conversationId, rt, text, message.seq);
      return { messageId: message.id };
    } catch (error) {
      rt.busy = false;
      throw error;
    }
  }

  /**
   * Listen to a conversation's events. With a `lastEventId` the buffered events after it are
   * replayed first; without one nothing is replayed (history comes from the read-only store).
   */
  subscribe(
    conversationId: string,
    lastEventId: number | null,
    listener: EventListener,
  ): () => void {
    const rt = this.runtime(conversationId);
    if (lastEventId !== null) for (const e of rt.buffer) if (e.id > lastEventId) listener(e);
    rt.listeners.add(listener);
    return () => rt.listeners.delete(listener);
  }

  isBusy(conversationId: string): boolean {
    return this.runtimes.get(conversationId)?.busy ?? false;
  }

  /** Ask the agent to stop the running turn of a conversation. */
  async cancel(conversationId: string): Promise<void> {
    await this.runtimes.get(conversationId)?.chat?.cancel();
  }

  /**
   * [reset assistant] (T051): drop the assistant's session; the next message opens a fresh one
   * that gets the portal and steps but not the earlier messages. History stays in the store.
   */
  async reset(conversationId: string): Promise<void> {
    if (!(await this.exists(conversationId)))
      throw new ChatError(404, 'This conversation does not exist.');
    const rt = this.runtime(conversationId);
    if (rt.busy)
      throw new ChatError(409, 'The assistant is still answering. Press [stop] first, then reset.');
    rt.chat?.close();
    rt.chat = null;
    rt.needsRestart = false;
    await this.opts.store.setAcpSession(conversationId, null);
    this.handle(
      conversationId,
      rt,
      {
        type: 'notice',
        text: 'Assistant context reset. Your next message starts a fresh session: it knows the portal and the step progress, not the earlier messages.',
      },
      false,
    );
    await rt.queue;
  }

  agentStatus(): AgentStatus {
    let any = false;
    let down = false;
    for (const rt of this.runtimes.values()) {
      if (rt.chat === null) continue;
      any = true;
      if (rt.chat.alive) return 'up';
      down = true;
    }
    return any && down ? 'down' : 'idle';
  }

  /** Resolves when everything queued for the conversation has been persisted and published. */
  async drain(conversationId: string): Promise<void> {
    await this.runtime(conversationId).queue;
  }

  close(): void {
    for (const rt of this.runtimes.values()) rt.chat?.close();
  }

  private runtime(conversationId: string): Runtime {
    let rt = this.runtimes.get(conversationId);
    if (rt === undefined) {
      rt = {
        chat: null,
        busy: false,
        needsRestart: false,
        nextId: 1,
        buffer: [],
        listeners: new Set(),
        text: '',
        queue: Promise.resolve(),
        idleWaiters: [],
      };
      this.runtimes.set(conversationId, rt);
    }
    return rt;
  }

  private publish(rt: Runtime, event: ChatEvent): void {
    const sequenced: SequencedEvent = { id: rt.nextId, event };
    rt.nextId += 1;
    rt.buffer.push(sequenced);
    if (rt.buffer.length > REPLAY_BUFFER_SIZE)
      rt.buffer.splice(0, rt.buffer.length - REPLAY_BUFFER_SIZE);
    for (const listener of rt.listeners) {
      try {
        listener(sequenced);
      } catch {
        // one broken listener must not stop the others
      }
    }
  }

  /** Publish events found outside a turn (the step recorder's timer), in queue order. */
  inject(conversationId: string, events: readonly ChatEvent[]): void {
    const rt = this.runtime(conversationId);
    for (const event of events) this.handle(conversationId, rt, event, false);
  }

  /** Persist what needs persisting, then publish; strictly in arrival order. */
  private handle(conversationId: string, rt: Runtime, event: ChatEvent, observe = true): void {
    let extra: ChatEvent[] = [];
    rt.queue = rt.queue
      .then(async () => {
        await this.persist(conversationId, rt, event);
        if (observe && this.opts.observe) extra = await this.opts.observe(conversationId, event);
      })
      .catch(async (error: unknown) => {
        await this.opts.logError({
          conversation_id: conversationId,
          where: 'chat-service persist',
          message: 'A chat message could not be saved.',
          detail: error,
        });
      })
      .then(() => {
        this.publish(rt, event);
        for (const e of extra) this.publish(rt, e);
        if (event.type === 'idle') {
          const waiters = rt.idleWaiters.splice(0);
          for (const w of waiters) w();
        }
      });
  }

  private async persist(conversationId: string, rt: Runtime, event: ChatEvent): Promise<void> {
    const store = this.opts.store;
    switch (event.type) {
      case 'message_chunk':
        rt.text += event.text;
        return;
      case 'message_done': {
        const text = rt.text;
        rt.text = '';
        if (text !== '')
          await store.appendMessage(conversationId, { role: 'assistant', content: text });
        return;
      }
      case 'refused':
        await store.appendMessage(conversationId, {
          role: 'system',
          content: `Refused: ${event.title}. ${event.reason}`,
          toolName: event.tool,
        });
        return;
      case 'error':
        await store.appendMessage(conversationId, {
          role: 'system',
          content: event.message,
          errorRef: event.ref,
        });
        return;
      case 'notice':
        await store.appendMessage(conversationId, { role: 'system', content: event.text });
        return;
      case 'step_changed':
        // The tracker reads the steps table; the chat only needs to say when a step failed.
        if (event.status === 'failed')
          await store.appendMessage(conversationId, {
            role: 'system',
            content: `The ${event.step} step failed. Ask the assistant what to do next, or give the reference to a developer.`,
            errorRef: event.errorRef,
          });
        return;
      case 'idle':
        rt.text = ''; // a turn that died mid-answer leaves no half message behind
        return;
      default:
        return;
    }
  }

  private newChat(conversationId: string, rt: Runtime): AcpChat {
    return new AcpChat({
      launch: this.opts.launch,
      session: this.opts.sessionRequest(conversationId),
      policy: this.opts.policy,
      onEvent: (event) => this.handle(conversationId, rt, event),
      logError: this.opts.logError,
      conversationId,
      ...(this.opts.turnTimeoutMs === undefined ? {} : { turnTimeoutMs: this.opts.turnTimeoutMs }),
    });
  }

  private async ensureChat(
    conversationId: string,
    rt: Runtime,
  ): Promise<{ chat: AcpChat; kind: SessionKind }> {
    if (rt.chat !== null && rt.chat.alive) return { chat: rt.chat, kind: 'continuing' };
    // A session existed before (this runtime's, or a stored one from before a service restart,
    // F-18) and was not reset: it was lost, so the new one also gets the last messages.
    const stored = (await this.opts.store.getConversation(conversationId))?.acp_session_id ?? null;
    const replacing = rt.chat !== null || rt.needsRestart || stored !== null;
    rt.chat?.close();
    rt.chat = null;
    const chat = this.newChat(conversationId, rt);
    rt.chat = chat;
    let sessionId: string;
    try {
      sessionId = await chat.start();
    } catch (error) {
      rt.needsRestart = true;
      throw error;
    }
    rt.needsRestart = false;
    await this.opts.store.setAcpSession(conversationId, sessionId);
    if (replacing)
      this.handle(conversationId, rt, {
        type: 'notice',
        text: 'The assistant was restarted in a new session. It was given the portal, the step progress and the last messages of this conversation.',
      });
    return { chat, kind: replacing ? 'restart' : 'fresh' };
  }

  /** The BA's text with the handover block before it (T051): what the assistant cannot see. */
  private async withHandover(
    conversationId: string,
    kind: SessionKind,
    text: string,
    seq: number,
  ): Promise<string> {
    const conversation = await this.opts.store.getConversation(conversationId);
    if (conversation === null) return text;
    const messages = (await this.opts.store.listMessages(conversationId)).filter(
      (m) => m.seq < seq,
    );
    const steps = await this.opts.store.listSteps(conversationId);
    return promptWithHandover(handover({ kind, conversation, steps, messages }), text);
  }

  private async runTurn(
    conversationId: string,
    rt: Runtime,
    text: string,
    seq: number,
  ): Promise<void> {
    let finished = false;
    try {
      const { chat, kind } = await this.ensureChat(conversationId, rt);
      const idle = new Promise<void>((resolve) => {
        rt.idleWaiters.push(resolve);
      });
      await chat.prompt(await this.withHandover(conversationId, kind, text, seq));
      finished = true;
      // The agent's own message_done and idle events arrive on the update pump; wait briefly.
      await Promise.race([idle, new Promise<void>((r) => setTimeout(r, 1000))]);
    } catch {
      // AcpChat already logged and emitted an error event with a ref.
      rt.needsRestart = rt.chat === null || !rt.chat.alive;
    } finally {
      if (!finished) this.handle(conversationId, rt, { type: 'idle' });
      await rt.queue;
      rt.busy = false;
    }
  }
}
