import { readFile, readdir } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createEvidenceStore, type EvidenceStore } from '../evidence.js';
import { dbPathFor, openDb } from '../db.js';
import { newId, nowIso } from '../ids.js';
import { joinTurns, type CallSpanRef, type JoinedTurn } from './join.js';
import { fitText } from './limits.js';
import { parseTranscript } from './transcript.js';

export interface ImportAgentOptions {
  /** Direct transcript path; takes precedence over `agentId`. */
  transcriptPath?: string;
  /** Resolved via `~/.claude/projects/*\/*\/subagents/agent-<id>.jsonl`. */
  agentId?: string;
  dataDir: string;
}

export interface StoreImportResult {
  env: string;
  run_ids: string[];
  turns: number;
  matched: number;
  unmatched_agent_calls: number;
  unmatched_server_calls: number;
}

export interface ImportAgentResult {
  agent_id: string | null;
  stores: StoreImportResult[];
  skipped?: string;
}

async function resolveTranscriptPath(opts: ImportAgentOptions): Promise<string | null> {
  if (opts.transcriptPath) return opts.transcriptPath;
  if (!opts.agentId) return null;
  const pattern = join(
    homedir(),
    '.claude',
    'projects',
    '*',
    '*',
    'subagents',
    `agent-${opts.agentId}.jsonl`,
  );
  for await (const p of glob(pattern)) return p;
  return null;
}

async function listEnvironments(dataDir: string): Promise<string[]> {
  try {
    const files = await readdir(join(dataDir, 'db'));
    return files.filter((f) => f.endsWith('.sqlite')).map((f) => f.slice(0, -'.sqlite'.length));
  } catch {
    return [];
  }
}

/** Cap a masked string to the storage limit, storing the full text as evidence when it overflows. */
async function capText(
  store: Pick<EvidenceStore, 'storeText'>,
  text: string | null,
): Promise<{ text: string | null; payload_ref: string | null }> {
  if (text === null) return { text: null, payload_ref: null };
  const { text: fitted, truncated } = fitText(text);
  if (!truncated) return { text: fitted, payload_ref: null };
  const payload_ref = await store.storeText(text, 'txt');
  return { text: fitted, payload_ref };
}

interface Row {
  id: string;
  agent_id: string;
  agent_type: string;
  session_id: string | null;
  message_uuid: string;
  block_index: number;
  api_message_id: string | null;
  run_id: string | null;
  role: string;
  kind: string;
  tool_use_id: string | null;
  tool_name: string | null;
  text: string | null;
  payload_ref: string | null;
  is_error: 0 | 1 | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  matched: 0 | 1;
  created_at: string;
  imported_at: string;
}

const UPSERT = `INSERT INTO agent_turns (
    id, agent_id, agent_type, session_id, message_uuid, block_index, api_message_id,
    run_id, role, kind, tool_use_id, tool_name, text, payload_ref, is_error, model,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, matched,
    created_at, imported_at
  ) VALUES (@id, @agent_id, @agent_type, @session_id, @message_uuid, @block_index,
    @api_message_id, @run_id, @role, @kind, @tool_use_id, @tool_name, @text, @payload_ref,
    @is_error, @model, @input_tokens, @output_tokens, @cache_read_tokens,
    @cache_creation_tokens, @matched, @created_at, @imported_at)
  ON CONFLICT (agent_id, message_uuid, block_index) DO UPDATE SET
    api_message_id = excluded.api_message_id, run_id = excluded.run_id, role = excluded.role,
    kind = excluded.kind, tool_use_id = excluded.tool_use_id, tool_name = excluded.tool_name,
    text = excluded.text, payload_ref = excluded.payload_ref, is_error = excluded.is_error,
    model = excluded.model, input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens, cache_read_tokens = excluded.cache_read_tokens,
    cache_creation_tokens = excluded.cache_creation_tokens, matched = excluded.matched,
    created_at = excluded.created_at, imported_at = excluded.imported_at`;

/**
 * Import a crawler subagent transcript (contracts/agent-import.md). Reads the file once, then
 * joins it against every environment store's call spans; a store with no matching `tool_use_id`
 * or `agent_id` is left untouched (a transcript normally matches exactly one). Idempotent: upsert
 * on (agent_id, message_uuid, block_index) keeps a row's id across re-imports.
 */
export async function importAgent(opts: ImportAgentOptions): Promise<ImportAgentResult> {
  const transcriptPath = await resolveTranscriptPath(opts);
  if (!transcriptPath) {
    return { agent_id: opts.agentId ?? null, stores: [], skipped: 'transcript not found' };
  }

  let raw: string;
  try {
    raw = await readFile(transcriptPath, 'utf8');
  } catch {
    return { agent_id: opts.agentId ?? null, stores: [], skipped: 'transcript unreadable' };
  }

  const parsed = parseTranscript(raw.split('\n'));
  const agentId = parsed.agentId ?? opts.agentId ?? null;
  if (parsed.turns.length === 0) {
    return { agent_id: agentId, stores: [], skipped: 'no importable turns' };
  }

  const toolUseIds = new Set(
    parsed.turns.filter((t) => t.tool_use_id).map((t) => t.tool_use_id as string),
  );
  const importedAt = nowIso();
  const evidence = createEvidenceStore(join(opts.dataDir, 'evidence'));
  const results: StoreImportResult[] = [];

  for (const env of await listEnvironments(opts.dataDir)) {
    const opened = openDb(dbPathFor(opts.dataDir, env));
    try {
      const spans = opened.raw
        .prepare(
          `SELECT id, run_id, tool_use_id, agent_id, name FROM trace_spans WHERE kind = 'call'`,
        )
        .all() as CallSpanRef[];
      const relevant = spans.filter(
        (s) => (s.tool_use_id !== null && toolUseIds.has(s.tool_use_id)) || s.agent_id === agentId,
      );
      if (relevant.length === 0) continue;

      const { turns, unmatchedAgentCalls, unmatchedServerCalls } = joinTurns(
        parsed.turns,
        relevant,
        agentId,
      );

      const rows: Row[] = [];
      for (const t of turns) {
        const { text, payload_ref } = await capText(evidence, t.text);
        rows.push({
          id: newId(),
          agent_id: t.agent_id ?? agentId ?? '',
          agent_type: 'crawler',
          session_id: t.session_id,
          message_uuid: t.message_uuid,
          block_index: t.block_index,
          api_message_id: t.api_message_id,
          run_id: t.run_id,
          role: t.role,
          kind: t.kind,
          tool_use_id: t.tool_use_id,
          tool_name: t.tool_name,
          text,
          payload_ref,
          is_error: t.is_error === null ? null : t.is_error ? 1 : 0,
          model: t.model,
          input_tokens: t.input_tokens,
          output_tokens: t.output_tokens,
          cache_read_tokens: t.cache_read_tokens,
          cache_creation_tokens: t.cache_creation_tokens,
          matched: t.matched ? 1 : 0,
          created_at: t.created_at,
          imported_at: importedAt,
        });
      }

      const upsert = opened.raw.prepare(UPSERT);
      opened.raw.transaction((batch: Row[]) => {
        for (const r of batch) upsert.run(r);
      })(rows);

      const runIds = [
        ...new Set(turns.filter((t: JoinedTurn) => t.run_id).map((t) => t.run_id as string)),
      ];
      results.push({
        env,
        run_ids: runIds,
        turns: rows.length,
        matched: turns.filter((t) => t.matched).length,
        unmatched_agent_calls: unmatchedAgentCalls.length,
        unmatched_server_calls: unmatchedServerCalls.length,
      });
    } finally {
      await opened.close();
    }
  }

  return { agent_id: agentId, stores: results };
}
