// `mudpuppy-chat` MCP server (R-30 T015, contracts/orchestrator-tools.md): the orchestrator's own
// tools. Every tool returns structured JSON or a coded error (`MISSING_INPUT`, `INVALID`, ...);
// gate refusals happen later in the mudpuppy server and are passed through by the crawler.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import { SECRETS, type EvidenceStore } from '@mudpuppy/core';
import { type MudPuppyDb } from '@mudpuppy/store';
import { registerModelTools } from './mcp-model-tools.js';
import { registerPageTools } from './mcp-page-tools.js';
import { registerProcessTools } from './mcp-process-tools.js';
import {
  registerAmendmentTools,
  registerScanTools,
  registerScopeTools,
  registerSetupTools,
} from './mcp-workflow-tools.js';
import { PersonaRefusal } from './personas.js';
import { ProposalRefusal } from './proposals.js';
import type { CheckRunDeps } from './check-runs.js';
import { RunRefusal } from './runs.js';
import { ScanRefusal } from './scan.js';
import { ScopeRefusal } from './scope.js';
import type { WorkspacePaths } from './workflow-data.js';

export interface ChatMcpContext {
  raw: BetterSqlite3.Database;
  paths: WorkspacePaths;
  /** The chat conversation this agent session belongs to (passed by the chat service). */
  conversationId: string;
  /** Recorded layouts for page_context and highlight_element (spec 022); null in tests without. */
  evidence?: EvidenceStore | null;
  /** The typed store for suggest_grouping (spec 022 M5); without it the tool is not offered. */
  db?: MudPuppyDb | null;
  /** Check runs (spec 039 owner answer 19); without it start_check_run is not offered. */
  checkRuns?: CheckRunDeps | null;
}

function ok(value: unknown): CallToolResult {
  const safe = SECRETS.redactJson(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe) }],
    structuredContent: safe as Record<string, unknown>,
  };
}

function refused(code: string, message: string, details: string[] = []): CallToolResult {
  const body = { error: { code, message, ...(details.length > 0 ? { details } : {}) } };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

function fail(error: unknown): CallToolResult {
  if (error instanceof PersonaRefusal) return refused(error.code, error.message, error.details);
  if (error instanceof ScanRefusal) return refused(error.code, error.message, error.missing);
  if (error instanceof ScopeRefusal) return refused(error.code, error.message, error.details);
  if (error instanceof RunRefusal) return refused(error.code, error.message);
  if (error instanceof ProposalRefusal) return refused(error.code, error.message);
  if (error instanceof z.ZodError)
    return refused(
      'INVALID',
      'the input is not valid',
      error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  return refused('INTERNAL', 'internal error in mudpuppy-chat; the chat service logs it');
}

export function createChatMcpServer(ctx: ChatMcpContext): McpServer {
  const server = new McpServer({ name: 'mudpuppy-chat', version: '0.1.0' });
  registerPageTools(server, { raw: ctx.raw, evidence: ctx.evidence ?? null }, ok, refused);
  registerModelTools(server, { raw: ctx.raw, checkRuns: ctx.checkRuns ?? null }, ok, refused);
  registerProcessTools(
    server,
    { raw: ctx.raw, db: ctx.db ?? null, conversationId: ctx.conversationId },
    ok,
    refused,
  );
  // The workflow tools, in the order the orchestrator's tool list shows them.
  const results = { ok, fail };
  registerSetupTools(server, ctx, results);
  registerScanTools(server, ctx, results);
  registerScopeTools(server, ctx, results);
  registerAmendmentTools(server, ctx, results);
  return server;
}
