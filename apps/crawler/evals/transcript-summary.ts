/**
 * What one agent session did, read from its Claude Code transcript (spec 034 F-21: the map BA
 * session's thin data pass was found this way). Pure: lines of the `.jsonl` file in, a summary out.
 */

export interface SessionSummary {
  /** Tool calls per tool (server prefix dropped). */
  calls: Record<string, number>;
  /** Records written per kind (successful `create_record` calls). */
  written: Record<string, number>;
  /** Refused tool calls: tool, error code and the start of the message. */
  refused: { tool: string; code: string; message: string }[];
  /** Each recorded pass with the records written before it and its warnings. */
  passes: { pass: string; records_before: number; warnings: string[] }[];
  /** The largest context a turn read, in tokens. */
  max_context_tokens: number;
  turns: number;
}

type Block = {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};
type Line = {
  type?: string;
  message?: { content?: unknown; usage?: Record<string, number | undefined> };
};

const short = (name: string) => name.split('__').at(-1) ?? name;

const resultText = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((c: { text?: string }) => c.text ?? '').join('')
      : '';

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Summarise a transcript given as its lines. */
export function summariseTranscript(lines: readonly string[]): SessionSummary {
  const s: SessionSummary = {
    calls: {},
    written: {},
    refused: [],
    passes: [],
    max_context_tokens: 0,
    turns: 0,
  };
  const pending = new Map<string, Block>();
  let records = 0;
  for (const raw of lines) {
    const line = parseJson(raw) as Line | null;
    const usage = line?.message?.usage;
    if (line?.type === 'assistant' && usage) {
      s.turns += 1;
      const ctx =
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      s.max_context_tokens = Math.max(s.max_context_tokens, ctx);
    }
    const content = line?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as Block[]) {
      if (b.type === 'tool_use' && b.id && b.name) {
        const tool = short(b.name);
        s.calls[tool] = (s.calls[tool] ?? 0) + 1;
        pending.set(b.id, { ...b, name: tool });
      }
      if (b.type !== 'tool_result' || !b.tool_use_id) continue;
      const call = pending.get(b.tool_use_id);
      if (!call?.name) continue;
      const text = resultText(b.content);
      const body = parseJson(text);
      const error = body?.error as { code?: string; message?: string } | undefined;
      if (b.is_error || error) {
        s.refused.push({
          tool: call.name,
          code: error?.code ?? 'ERROR',
          message: (error?.message ?? text).slice(0, 200),
        });
        continue;
      }
      if (call.name === 'create_record') {
        const kind = String(call.input?.kind ?? '?');
        s.written[kind] = (s.written[kind] ?? 0) + 1;
        records += 1;
      }
      if (call.name === 'record_pass')
        s.passes.push({
          pass: String(call.input?.pass ?? '?'),
          records_before: records,
          warnings: Array.isArray(body?.warnings) ? body.warnings.map(String) : [],
        });
    }
  }
  return s;
}
