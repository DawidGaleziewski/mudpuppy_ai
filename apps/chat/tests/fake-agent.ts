// In-process fake ACP agent for chat-service tests. Behaviour is scripted by the prompt text.
import { writeFileSync } from 'node:fs';
import * as acp from '@agentclientprotocol/sdk';
import type { AgentLauncher } from '../src/acp-client.js';

export interface FakeAgentLog {
  sessions: acp.NewSessionRequest[];
  /** The BA's text of each prompt. */
  prompts: string[];
  /** Each prompt as sent, with the service's handover block. */
  rawPrompts: string[];
  permissionOutcomes: string[];
  cancelled: number;
}

type Client = acp.AgentContext;

async function say(client: Client, sessionId: string, text: string): Promise<void> {
  await client.notify(acp.methods.client.session.update, {
    sessionId,
    update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
  });
}

async function toolCall(
  client: Client,
  sessionId: string,
  log: FakeAgentLog,
  call: { id: string; tool: string; title: string; parent?: string; rawInput?: unknown },
): Promise<string> {
  const meta = {
    claudeCode: { toolName: call.tool, ...(call.parent ? { parentToolUseId: call.parent } : {}) },
  };
  await client.notify(acp.methods.client.session.update, {
    sessionId,
    update: {
      sessionUpdate: 'tool_call',
      toolCallId: call.id,
      title: call.title,
      status: 'pending',
      rawInput: call.rawInput,
      _meta: meta,
    },
  });
  const response = await client.request(acp.methods.client.session.requestPermission, {
    sessionId,
    toolCall: { toolCallId: call.id, title: call.title, rawInput: call.rawInput },
    options: [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
  });
  const outcome = response.outcome.outcome === 'selected' ? response.outcome.optionId : 'cancelled';
  log.permissionOutcomes.push(`${call.tool}:${outcome}`);
  await client.notify(acp.methods.client.session.update, {
    sessionId,
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId: call.id,
      status: outcome === 'allow' ? 'completed' : 'failed',
    },
  });
  return outcome;
}

export function fakeAgent(): { launch: AgentLauncher; log: FakeAgentLog } {
  const log: FakeAgentLog = {
    sessions: [],
    prompts: [],
    rawPrompts: [],
    permissionOutcomes: [],
    cancelled: 0,
  };
  let agentConnection: acp.AgentConnection | null = null;
  let release: (() => void) | null = null;

  const app = acp
    .agent({ name: 'fake-agent' })
    .onConnect((connection) => {
      agentConnection = connection;
    })
    .onRequest(acp.methods.agent.initialize, () => ({
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {},
      authMethods: [],
    }))
    .onRequest(acp.methods.agent.session.new, (ctx) => {
      log.sessions.push(ctx.params);
      return { sessionId: `fake-session-${String(log.sessions.length)}` };
    })
    .onNotification(acp.methods.agent.session.cancel, () => {
      log.cancelled += 1;
      release?.();
    })
    .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
      const { sessionId } = ctx.params;
      const first = ctx.params.prompt[0];
      const raw = first?.type === 'text' ? first.text : '';
      log.rawPrompts.push(raw);
      // Scripts match the BA's text; the service's handover block (T051) goes before it.
      const marker = "\n\nBA's message:\n";
      const text = raw.includes(marker) ? raw.slice(raw.indexOf(marker) + marker.length) : raw;
      log.prompts.push(text);
      const client = ctx.client;
      switch (text) {
        case 'hello':
          await say(client, sessionId, 'Hi, ');
          await say(client, sessionId, 'I can scan a portal.');
          await client.notify(acp.methods.client.session.update, {
            sessionId,
            update: {
              sessionUpdate: 'plan',
              entries: [{ content: 'Scan portal', priority: 'high', status: 'pending' }],
            },
          });
          return { stopReason: 'end_turn' };
        case 'text-tool-text':
          await say(client, sessionId, 'Resuming it.');
          await toolCall(client, sessionId, log, {
            id: 't3',
            tool: 'mcp__mudpuppy-chat__workflow_state',
            title: 'workflow_state',
          });
          await say(client, sessionId, 'The scan is running.');
          return { stopReason: 'end_turn' };
        case 'workflow':
          await toolCall(client, sessionId, log, {
            id: 't1',
            tool: 'mcp__mudpuppy-chat__workflow_state',
            title: 'workflow_state',
          });
          return { stopReason: 'end_turn' };
        case 'bash':
          await toolCall(client, sessionId, log, {
            id: 't2',
            tool: 'Bash',
            title: 'rm -rf .claude',
            rawInput: { command: 'rm -rf .claude' },
          });
          return { stopReason: 'end_turn' };
        case 'subagent':
          await client.notify(acp.methods.client.session.update, {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'a1',
              title: 'crawler',
              status: 'in_progress',
              rawInput: { subagent_type: 'crawler', prompt: 'map it' },
              _meta: { claudeCode: { toolName: 'Agent' } },
            },
          });
          await toolCall(client, sessionId, log, {
            id: 'c1',
            tool: 'mcp__mudpuppy__navigate',
            title: 'navigate',
            parent: 'a1',
          });
          return { stopReason: 'end_turn' };
        case 'limit':
          // What the Claude Code adapter returns when the account is out of usage (F-21).
          throw acp.RequestError.internalError(
            undefined,
            "You've hit your weekly limit · resets 9pm (Europe/Warsaw)",
          );
        case 'crash':
          agentConnection?.close(new Error('fake crash'));
          return { stopReason: 'end_turn' };
        case 'busy':
          // A long turn that keeps reporting progress, like a background crawler (F-20).
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 20));
            await say(client, sessionId, '.');
          }
          return { stopReason: 'end_turn' };
        case 'hang':
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { stopReason: 'cancelled' };
        default: {
          // `call {"tool": ..., "rawInput": ..., "agent"?: "crawler", "say"?: "..."}`: one scripted
          // tool call (inside a started subagent when `agent` is set). A `Write` that is allowed
          // really writes `rawInput.file_path`, like the real tool would; text in `say` is sent
          // after the call, as the agent relaying a tool result.
          if (text.startsWith('call ')) {
            const spec = JSON.parse(text.slice(5)) as {
              tool: string;
              rawInput?: { file_path?: string; content?: string };
              agent?: string;
              say?: string;
            };
            let parent: string | undefined;
            if (spec.agent !== undefined) {
              parent = 'agent-1';
              await client.notify(acp.methods.client.session.update, {
                sessionId,
                update: {
                  sessionUpdate: 'tool_call',
                  toolCallId: parent,
                  title: spec.agent,
                  status: 'in_progress',
                  rawInput: { subagent_type: spec.agent },
                  _meta: { claudeCode: { toolName: 'Agent' } },
                },
              });
            }
            const outcome = await toolCall(client, sessionId, log, {
              id: `call-${String(log.prompts.length)}`,
              tool: spec.tool,
              title: spec.tool,
              rawInput: spec.rawInput,
              ...(parent ? { parent } : {}),
            });
            if (outcome === 'allow' && spec.tool === 'Write' && spec.rawInput?.file_path)
              writeFileSync(spec.rawInput.file_path, spec.rawInput.content ?? 'x');
            if (spec.say !== undefined) await say(client, sessionId, spec.say);
            return { stopReason: 'end_turn' };
          }
          await say(client, sessionId, `echo: ${text}`);
          return { stopReason: 'end_turn' };
        }
      }
    });

  const launch: AgentLauncher = (client) => {
    const connection = client.connect(app);
    return { connection, stop: () => connection.close() };
  };
  return { launch, log };
}
