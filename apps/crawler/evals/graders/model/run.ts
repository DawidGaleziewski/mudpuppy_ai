/**
 * A judge over a list of pairs (spec 017 FR-008, research R10): every pair once per run, at most
 * `concurrency` calls at a time; a call without a valid answer (prose, error, timeout, crash) is
 * retried once, then recorded as an `error` verdict, never as pass or fail. A login problem or the
 * account's usage limit stops the whole run: its verdicts would measure the outage.
 */
import type { CallInit } from './answer.js';
import { callJudge, type CallRequest, type CallResult } from './call.js';
import type { JudgeDefinition, Pair } from './definition.js';
import type { JudgeLogin } from './login.js';
import { systemPrompt, userMessage } from './prompt.js';
import type { JudgeCost } from '@pathfinder/gates';
import type { Verdict } from './score.js';
import { JudgeSetupError } from './setup-error.js';

export interface RunVerdict extends Verdict {
  attempts: number;
}

export interface JudgeRunOutput {
  /** `runs[i]`: run i's verdicts, in pair order. */
  runs: RunVerdict[][];
  cost: JudgeCost;
  /** From the first call that reported it. */
  model: string;
  claudeCodeVersion: string;
}

export interface RunOptions {
  login: JudgeLogin;
  runs?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Injected in tests; the real isolated call otherwise. */
  call?: (r: CallRequest) => Promise<CallResult>;
}

type Attempt =
  { ok: true; result: CallResult } | { ok: false; reason: string; result?: CallResult };

function failure(r: CallResult): string {
  if (r.timedOut) return 'timed out';
  if (r.isError) return 'call failed';
  return 'no valid answer';
}

async function attempt(call: RunOptions['call'] & {}, req: CallRequest): Promise<Attempt> {
  try {
    const result = await call(req);
    if (result.limitHit)
      throw new JudgeSetupError(
        'USAGE_LIMIT',
        `usage limit hit: ${result.rawResult.slice(0, 200)}`,
      );
    if (result.answer) return { ok: true, result };
    return { ok: false, reason: `${failure(result)}: ${result.rawResult.slice(0, 300)}`, result };
  } catch (e) {
    if (e instanceof JudgeSetupError) throw e;
    return { ok: false, reason: `call crashed: ${(e as Error).message.slice(0, 300)}` };
  }
}

/**
 * Runs `tasks` with at most `limit` in flight. The first rejection rejects the pool, and no
 * worker starts another task after it (calls already in flight finish on their own).
 */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array<T>(tasks.length);
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < tasks.length) {
      const i = next++;
      try {
        out[i] = await tasks[i]!();
      } catch (e) {
        stopped = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

export async function runJudge(
  def: JudgeDefinition,
  pairs: readonly Pair[],
  o: RunOptions,
): Promise<JudgeRunOutput> {
  const call = o.call ?? callJudge;
  const system = systemPrompt(def);
  const cost: JudgeCost = { usd: 0, input_tokens: 0, output_tokens: 0, calls: 0 };
  let init: CallInit | null = null;
  const count = (r: CallResult | undefined) => {
    cost.calls += 1;
    if (!r) return;
    cost.usd += r.usage.usd;
    cost.input_tokens += r.usage.input_tokens;
    cost.output_tokens += r.usage.output_tokens;
    init ??= r.init;
  };
  const judgeOne = async (pair: Pair): Promise<RunVerdict> => {
    const req = {
      model: def.model,
      system,
      user: userMessage(pair),
      login: o.login,
      timeoutMs: o.timeoutMs,
    };
    const first = await attempt(call, req);
    count(first.result);
    const second = first.ok ? first : await attempt(call, req);
    if (!first.ok) count(second.result);
    const attempts = first.ok ? 1 : 2;
    if (!second.ok) return { pairId: pair.id, verdict: 'error', reason: second.reason, attempts };
    const a = second.result.answer!;
    return { pairId: pair.id, verdict: a.verdict, reason: a.reason, attempts };
  };
  const runs = o.runs ?? 1;
  const tasks = Array.from({ length: runs }, () => pairs.map((p) => () => judgeOne(p))).flat();
  const flat = await pool(tasks, o.concurrency ?? 4);
  const resolved = init as CallInit | null;
  return {
    runs: Array.from({ length: runs }, (_, i) =>
      flat.slice(i * pairs.length, (i + 1) * pairs.length),
    ),
    cost: { ...cost, usd: Math.round(cost.usd * 1e6) / 1e6 },
    model: resolved?.model ?? def.model,
    claudeCodeVersion: resolved?.claudeCodeVersion ?? 'unknown',
  };
}
