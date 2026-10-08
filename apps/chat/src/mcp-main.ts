// stdio entry of the `pathfinder-chat` MCP server. The chat service starts one per agent session
// and passes the conversation in PATHFINDER_CHAT_CONVERSATION (session-config.ts).

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/store';
import { createChatMcpServer } from './mcp-chat.js';

// apps/chat/src -> repo root is three levels up.
const repoRoot = process.env.PATHFINDER_ROOT ?? fileURLToPath(new URL('../../..', import.meta.url));
const conversationId = process.env.PATHFINDER_CHAT_CONVERSATION;
if (conversationId === undefined || conversationId === '') {
  console.error('PATHFINDER_CHAT_CONVERSATION is required');
  process.exit(1);
}

const opened = openDb(dbPathFor(join(repoRoot, 'data'), process.env.PATHFINDER_ENV ?? 'sandbox'));
migrateUp(opened.raw, join(repoRoot, 'data', 'migrations'));
const server = createChatMcpServer({ raw: opened.raw, paths: { repoRoot }, conversationId });
await server.connect(new StdioServerTransport());
