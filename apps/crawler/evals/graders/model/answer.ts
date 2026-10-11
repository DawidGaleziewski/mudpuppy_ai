/**
 * The judge's answer: the JSON schema the CLI forces (`--json-schema`), and the parser for the
 * CLI's `--output-format stream-json --verbose` output (spec 017 research R1, R4). Pure, so it is
 * tested on saved outputs (`tests/fixtures/judge/`) without calling the model.
 */
import { z } from 'zod';

/**
 * `reason` is listed first and the instructions ask for it first; the model may still write
 * `verdict` first (seen in real outputs, findings F-03), which changes nothing for the parser.
 */
export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    reason: { type: 'string', minLength: 1 },
    verdict: { enum: ['pass', 'fail', 'unknown'] },
  },
  required: ['reason', 'verdict'],
  additionalProperties: false,
} as const;

export const Answer = z.object({
  reason: z.string().min(1),
  verdict: z.enum(['pass', 'fail', 'unknown']),
});
export type Answer = z.infer<typeof Answer>;

/** What the `system/init` event says was loaded: the isolation check and provenance read it. */
export interface CallInit {
  model: string;
  claudeCodeVersion: string;
  tools: string[];
  mcpServers: string[];
  /** `source` of every plugin, e.g. `cc-plugin-telemetry@builtin`. */
  plugins: string[];
  skills: string[];
  agents: string[];
  memoryAuto: string | null;
}

export interface CallUsage {
  /** Fresh plus cache-read plus cache-write: everything the model read (as `harness/cost.ts`). */
  input_tokens: number;
  output_tokens: number;
  usd: number;
}

export interface CallOutput {
  init: CallInit | null;
  /** null when the model gave no valid structured answer. */
  answer: Answer | null;
  /** The result text, kept for an error verdict's reason. */
  rawResult: string;
  isError: boolean;
  authError: boolean;
  limitHit: boolean;
  usage: CallUsage;
}

const InitEvent = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  model: z.string(),
  claude_code_version: z.string(),
  tools: z.array(z.string()),
  mcp_servers: z.array(z.object({ name: z.string() }).loose()),
  plugins: z.array(z.object({ source: z.string() }).loose()).optional(),
  skills: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  memory_paths: z.object({ auto: z.string().optional() }).loose().optional(),
});

const ResultEvent = z.object({
  type: z.literal('result'),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .loose()
    .optional(),
});

// The same limit wording `harness/agent.ts` treats as an outage, not a result (spec 014 F-04).
const LIMIT = /hit your .*limit|rate.?limit/i;
const AUTH = /\b401\b|invalid bearer token|oauth access token is invalid|failed to authenticate/i;

function events(stdout: string): unknown[] {
  return stdout
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as unknown];
      } catch {
        return [];
      }
    });
}

function toInit(e: z.infer<typeof InitEvent>): CallInit {
  return {
    model: e.model,
    claudeCodeVersion: e.claude_code_version,
    tools: e.tools,
    mcpServers: e.mcp_servers.map((s) => s.name),
    plugins: (e.plugins ?? []).map((p) => p.source),
    skills: e.skills ?? [],
    agents: e.agents ?? [],
    memoryAuto: e.memory_paths?.auto ?? null,
  };
}

function toUsage(r: z.infer<typeof ResultEvent> | undefined): CallUsage {
  const u = r?.usage;
  return {
    input_tokens:
      (u?.input_tokens ?? 0) +
      (u?.cache_read_input_tokens ?? 0) +
      (u?.cache_creation_input_tokens ?? 0),
    output_tokens: u?.output_tokens ?? 0,
    usd: r?.total_cost_usd ?? 0,
  };
}

/** Read one judge call's output; never throws (garbage gives an error-shaped output). */
export function parseCallOutput(stdout: string): CallOutput {
  let init: CallInit | null = null;
  let result: z.infer<typeof ResultEvent> | undefined;
  for (const e of events(stdout)) {
    const i = InitEvent.safeParse(e);
    if (i.success) init = toInit(i.data);
    const r = ResultEvent.safeParse(e);
    if (r.success) result = r.data;
  }
  const rawResult = result?.result ?? stdout.slice(0, 300);
  const answer = Answer.safeParse(result?.structured_output);
  const isError = result === undefined || result.is_error === true;
  const valid = !isError && answer.success ? answer.data : null;
  return {
    init,
    answer: valid,
    rawResult,
    isError,
    authError: isError && AUTH.test(rawResult),
    // Only a call without an answer: a reason that mentions a rate limit is not an outage.
    limitHit: valid === null && LIMIT.test(rawResult),
    usage: toUsage(result),
  };
}
