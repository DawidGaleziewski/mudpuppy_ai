// stdio entry of the `mudpuppy-chat` MCP server. The chat service starts one per agent session
// and passes the conversation in MUDPUPPY_CHAT_CONVERSATION (session-config.ts).

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { requireEnvironment } from '@mudpuppy/config';
import { createEvidenceStore } from '@mudpuppy/core';
import { dbPathFor, migrateUp, openDb } from '@mudpuppy/store';
import { createChatMcpServer } from './mcp-chat.js';
import { LIVE_KIND } from './workbench-live.js';

// apps/chat/src -> repo root is three levels up.
const repoRoot = process.env.MUDPUPPY_ROOT ?? fileURLToPath(new URL('../../..', import.meta.url));
const conversationId = process.env.MUDPUPPY_CHAT_CONVERSATION;
if (conversationId === undefined || conversationId === '') {
  console.error('MUDPUPPY_CHAT_CONVERSATION is required');
  process.exit(1);
}

function workbenchKind(kind: string | undefined, environment: string) {
  if (kind === 'workbench') return { phase: 1, environment };
  if (kind === LIVE_KIND) return { phase: 1, environment, live: true };
  return null;
}

// Started by the chat service with its own environment; never a default (spec 030 R-61).
const environment = requireEnvironment(repoRoot, process.env.MUDPUPPY_ENV);
const opened = openDb(dbPathFor(join(repoRoot, 'data'), environment));
migrateUp(opened.raw, join(repoRoot, 'data', 'migrations'));
const server = createChatMcpServer({
  raw: opened.raw,
  db: opened.db,
  paths: { repoRoot },
  conversationId,
  evidence: createEvidenceStore(join(repoRoot, 'data', 'evidence')),
  checkRuns: { repoRoot, environment },
  // Spec 043: a Workbench session's server offers only the Workbench tools; spec 075: the live
  // Workbench's also `ask_choice`.
  workbench: workbenchKind(process.env.MUDPUPPY_CHAT_KIND, environment),
});
await server.connect(new StdioServerTransport());
