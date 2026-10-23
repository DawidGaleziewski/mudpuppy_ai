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
      /** A failed call's message (an MCP tool's error), e.g. why `start_run` refused (spec 073). */
      error?: string;
    }
  | { type: 'plan'; entries: { content: string; status: string }[] }
  | {
      type: 'step_changed';
      step: string;
      status: string;
      errorRef: string | null;
      /** Why a failed step failed (spec 073): its command card and the chat line say it. */
      message?: string;
    }
  | { type: 'refused'; tool: string | null; title: string; reason: string }
  | { type: 'error'; ref: string; message: string; logged: boolean }
  /** `tool` tags a notice the dashboard renders specially (e.g. `credential_stored`). */
  | { type: 'notice'; text: string; tool?: string }
  /**
   * Something the assistant asked the browser to do (spec 022 R6): highlight an element on a
   * recorded screen, open a page, or ask for a credential. Only from the mudpuppy-chat tools
   * `highlight_element` / `open_page` / `request_credential`, after they completed.
   */
  | UiAction
  | { type: 'idle' };

export type UiAction =
  | {
      type: 'ui_action';
      action: 'highlight';
      stateId: string;
      elementKey: string | null;
      label: string | null;
    }
  | { type: 'ui_action'; action: 'open'; path: string }
  /** Ask the BA for a credential in the chat (FE-A05); the value goes to the vault only. */
  | {
      type: 'ui_action';
      action: 'credential';
      portal: string;
      /** A declared environment name (free names, spec 030 R-61). */
      environment: string;
      persona: string;
      ref: string;
      reason: string | null;
    }
  /** Workbench words lane (spec 043, contracts/workbench-http.md): the model opened render_view. */
  | { type: 'wb_composing'; turn: number }
  /** A checked view was stored for the turn; `fallback`: nothing valid was left. */
  | { type: 'wb_view'; turn: number; viewId: string; fallback: boolean }
  /** render_view ended without a stored view. */
  | { type: 'wb_no_view'; turn: number }
  /** A command card changed state (proposed, running, done, failed, cancelled, expired). */
  | { type: 'wb_command'; id: string; state: string };

export type ChatEventListener = (event: ChatEvent) => void;
