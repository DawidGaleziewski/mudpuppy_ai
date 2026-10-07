// Chat events the service streams to the dashboard over SSE (contracts/chat-http-api.md).

export type ChatEvent =
  | { type: 'message_chunk'; text: string }
  | { type: 'message_done'; stopReason: string }
  | {
      type: 'tool_started';
      toolCallId: string;
      tool: string | null;
      title: string;
      /** Set when a `crawler`/`ba` subagent made the call. */
      parentToolCallId: string | null;
      /** For an `Agent` call: the subagent it starts (`crawler`, `ba`). */
      agent: string | null;
    }
  | {
      type: 'tool_finished';
      toolCallId: string;
      tool: string | null;
      status: 'completed' | 'failed';
      parentToolCallId: string | null;
      /**
       * For an `Agent` call: the subagent it ran. Known here even when `tool_started` had null,
       * because the call's input streams in after it starts (seen in the real run, findings F-13).
       */
      agent: string | null;
      /**
       * The `Agent` call only launched the subagent, which keeps working in the background
       * ("Async agent launched"): its end is not the subagent's end (F-17).
       */
      background?: boolean;
    }
  | { type: 'plan'; entries: { content: string; status: string }[] }
  | { type: 'step_changed'; step: string; status: string; errorRef: string | null }
  | { type: 'refused'; tool: string | null; title: string; reason: string }
  | { type: 'error'; ref: string; message: string; logged: boolean }
  | { type: 'notice'; text: string }
  | { type: 'idle' };

export type ChatEventListener = (event: ChatEvent) => void;
