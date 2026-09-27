import { scrubTraceJson, scrubTraceText } from './scrub.js';

/** One content block of a Claude Code subagent transcript (contracts/agent-import.md "Parsing"). */
export interface ParsedTurn {
  agent_id: string | null;
  session_id: string | null;
  message_uuid: string;
  block_index: number;
  api_message_id: string | null;
  role: 'assistant' | 'user';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  tool_use_id: string | null;
  tool_name: string | null;
  text: string | null;
  is_error: boolean | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  created_at: string;
}

export interface ParsedTranscript {
  agentId: string | null;
  sessionId: string | null;
  turns: ParsedTurn[];
  skipped: { entries: number; unknownBlocks: number; invalidLines: number };
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface Entry {
  type?: string;
  isMeta?: boolean;
  uuid?: string;
  timestamp?: string;
  agentId?: string;
  sessionId?: string;
  apiBlockIndex?: number;
  message?: { id?: string; role?: string; model?: string; content?: unknown; usage?: Usage };
}

type Block = { type?: string; [k: string]: unknown };

function flattenResult(content: unknown): string {
  if (typeof content === 'string') return scrubTraceText(content);
  if (!Array.isArray(content)) return '';
  return (content as Block[])
    .map((p) =>
      p.type === 'text' && typeof p.text === 'string' ? scrubTraceText(p.text) : `[${p.type}]`,
    )
    .join('\n');
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * Pure parse of a subagent transcript. Every content block becomes a row; usage repeats on every
 * entry of one API message and output grows while streaming, so tokens are attached once per
 * message, to its highest block, with the largest output count (research §12).
 */
export function parseTranscript(lines: readonly string[]): ParsedTranscript {
  const turns: ParsedTurn[] = [];
  const skipped = { entries: 0, unknownBlocks: 0, invalidLines: 0 };
  let agentId: string | null = null;
  let sessionId: string | null = null;
  const usageByMessage = new Map<string, { row: number; usage: Usage; maxOutput: number }>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let e: Entry;
    try {
      e = JSON.parse(line) as Entry;
    } catch {
      skipped.invalidLines += 1;
      continue;
    }
    if ((e.type !== 'assistant' && e.type !== 'user') || e.isMeta || !e.message || !e.uuid) {
      skipped.entries += 1;
      continue;
    }
    agentId ??= e.agentId ?? null;
    sessionId ??= e.sessionId ?? null;
    const role = e.type;
    const msg = e.message;
    const apiId = role === 'assistant' ? (msg.id ?? null) : null;
    const base = {
      agent_id: e.agentId ?? null,
      session_id: e.sessionId ?? null,
      message_uuid: e.uuid,
      api_message_id: apiId,
      role,
      model: role === 'assistant' ? (msg.model ?? null) : null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_creation_tokens: null,
      created_at: e.timestamp ?? '',
    } as const;
    const empty = { tool_use_id: null, tool_name: null, is_error: null };

    const blocks: Block[] =
      typeof msg.content === 'string'
        ? [{ type: 'text', text: msg.content }]
        : Array.isArray(msg.content)
          ? (msg.content as Block[])
          : [];
    const first = typeof e.apiBlockIndex === 'number' ? e.apiBlockIndex : 0;

    blocks.forEach((b, i) => {
      const block_index = first + i;
      let row: ParsedTurn;
      if (b.type === 'text') {
        row = {
          ...base,
          ...empty,
          block_index,
          kind: 'text',
          text: scrubTraceText(String(b.text ?? '')),
        };
      } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
        row = { ...base, ...empty, block_index, kind: 'thinking', text: null };
      } else if (b.type === 'tool_use') {
        row = {
          ...base,
          ...empty,
          block_index,
          kind: 'tool_use',
          tool_use_id: typeof b.id === 'string' ? b.id : null,
          tool_name: typeof b.name === 'string' ? b.name : null,
          text: JSON.stringify(scrubTraceJson(b.input ?? {})),
        };
      } else if (b.type === 'tool_result') {
        row = {
          ...base,
          ...empty,
          block_index,
          kind: 'tool_result',
          tool_use_id: typeof b.tool_use_id === 'string' ? b.tool_use_id : null,
          is_error: b.is_error === true,
          text: flattenResult(b.content),
        };
      } else {
        skipped.unknownBlocks += 1;
        return;
      }
      turns.push(row);
      if (apiId && msg.usage) {
        const seen = usageByMessage.get(apiId);
        const out = num(msg.usage.output_tokens) ?? 0;
        const rowIdx = turns.length - 1;
        if (!seen) usageByMessage.set(apiId, { row: rowIdx, usage: msg.usage, maxOutput: out });
        else {
          if (block_index >= turns[seen.row]!.block_index) seen.row = rowIdx;
          seen.maxOutput = Math.max(seen.maxOutput, out);
        }
      }
    });
  }

  for (const { row, usage, maxOutput } of usageByMessage.values()) {
    const t = turns[row]!;
    t.input_tokens = num(usage.input_tokens);
    t.output_tokens = maxOutput;
    t.cache_read_tokens = num(usage.cache_read_input_tokens);
    t.cache_creation_tokens = num(usage.cache_creation_input_tokens);
  }
  return { agentId, sessionId, turns, skipped };
}
