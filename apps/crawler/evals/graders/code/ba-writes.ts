/**
 * How many of the BA's writes the server refused (spec 019 US4, spec 015 F-20): about 40 % on the
 * bank before spec 019. Counted from the transcripts' `tool_use` / `tool_result` pairs; a refused
 * call is one whose result is an error, so stored records are counted from results, never from calls
 * (spec 015 F-22). A code grader: no model, no tokens.
 */
import { readFileSync } from 'node:fs';

const WRITE_TOOLS = ['create_record', 'revise_record', 'withdraw_record'];

export interface BaWrites {
  calls: number;
  refused: number;
  /** Refused / calls, as a whole percent; 0 when there were no calls. */
  refused_pct: number;
  by_code: Record<string, number>;
}

type Block = {
  type?: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
};

const isWrite = (name: string | undefined): boolean =>
  name !== undefined && WRITE_TOOLS.some((t) => name === t || name.endsWith(`__${t}`));

/** The error code of a tool result, or null when the call succeeded. */
function errorCode(b: Block): string | null {
  const text = JSON.stringify(b.content ?? '');
  const code = /\\?"code\\?"\s*:\s*\\?"([A-Z_]+)\\?"/.exec(text)?.[1];
  if (b.is_error === true) return code ?? 'ERROR';
  return /\\?"error\\?"\s*:\s*\{/.test(text) ? (code ?? 'ERROR') : null;
}

/** Write calls and their refusals in transcript lines (one JSON entry per line). */
export function countBaWrites(lines: Iterable<string>): BaWrites {
  const writes = new Set<string>();
  const results = new Map<string, string | null>();
  for (const line of lines) {
    let entry: { message?: { content?: unknown } };
    try {
      entry = JSON.parse(line) as typeof entry;
    } catch {
      continue;
    }
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as Block[]) {
      if (b.type === 'tool_use' && b.id && isWrite(b.name)) writes.add(b.id);
      if (b.type === 'tool_result' && b.tool_use_id) results.set(b.tool_use_id, errorCode(b));
    }
  }
  const byCode: Record<string, number> = {};
  let refused = 0;
  for (const id of writes) {
    const code = results.get(id);
    if (!code) continue;
    refused += 1;
    byCode[code] = (byCode[code] ?? 0) + 1;
  }
  const calls = writes.size;
  return {
    calls,
    refused,
    refused_pct: calls === 0 ? 0 : Math.round((refused / calls) * 100),
    by_code: byCode,
  };
}

/** {@link countBaWrites} over the transcript files of a trial (missing files are skipped). */
export function scoreBaWrites(transcripts: readonly string[]): BaWrites {
  const lines: string[] = [];
  for (const t of transcripts) {
    try {
      lines.push(...readFileSync(t, 'utf8').split('\n'));
    } catch {
      // a transcript Claude Code did not keep: the sweep already warns about it
    }
  }
  return countBaWrites(lines);
}
