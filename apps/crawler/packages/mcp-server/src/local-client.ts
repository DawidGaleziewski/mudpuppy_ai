// The crawler tools in-process, for operator commands that drive runs themselves (the trace
// driver, spec 030 R-64): the same server the agent talks to, over an in-memory transport, so every
// call is gated, recorded and traced exactly like the agent's.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Runtime } from './runtime.js';
import { openServerContext } from './server-context.js';
import { createServer } from './tools/index.js';

/** A tool result: the parsed body and whether it was an error. */
export interface ToolReply {
  isError: boolean;
  body: Record<string, unknown>;
}
export type ToolCall = (name: string, args: Record<string, unknown>) => Promise<ToolReply>;

export async function openLocalClient(opts: {
  root: string;
  environment: string;
  runtime: Runtime;
}): Promise<{ call: ToolCall; close(): Promise<void> }> {
  const opened = await openServerContext(opts);
  const server = createServer(opened.ctx, opts.runtime);
  const client = new Client({ name: 'pathfinder-cli', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call: ToolCall = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[])[0]?.text ?? '{}';
    return { isError: r.isError === true, body: JSON.parse(text) as Record<string, unknown> };
  };
  return {
    call,
    close: async () => {
      await opts.runtime.closeAll();
      await client.close();
      await opened.close();
    },
  };
}
