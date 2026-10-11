import { z } from 'zod';

/** One category's score, as `docs:evaluate` reports it (pct 0–100). */
const Score = z.object({ matched: z.number(), total: z.number(), pct: z.number() }).strict();

export const JudgeCost = z
  .object({
    usd: z.number(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    calls: z.number().int(),
  })
  .strict();
export type JudgeCost = z.infer<typeof JudgeCost>;

/**
 * One model-based grader over the trial's documentation (spec 017 data-model JudgeRun). Kept out
 * of `scores` on purpose: judge scores never count as regressions (research R5), and the code
 * scores stay comparable with or without judges.
 */
export const JudgeRunResult = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    model: z.string().min(1),
    claude_code_version: z.string().min(1),
    /** Its newest `test` calibration for this wording met the bar (FR-011). */
    calibrated: z.boolean(),
    covered: z.number().int().min(0),
    total: z.number().int().min(0),
    pct: z.number(),
    counts: z
      .object({ pass: z.number(), fail: z.number(), unknown: z.number(), error: z.number() })
      .strict(),
    skipped_pairs: z.number().int().min(0),
    cost: JudgeCost,
    verdicts: z.array(
      z
        .object({
          pair_id: z.string(),
          verdict: z.enum(['pass', 'fail', 'unknown', 'error']),
          reason: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type JudgeRunResult = z.infer<typeof JudgeRunResult>;

/** A tier-2 eval result (contracts/gates-evals.md), one JSON file per run under data/evals/. */
export const EvalResult = z
  .object({
    portal_id: z.string().min(1),
    persona_id: z.string().min(1),
    started_at: z.string().min(1),
    git_sha: z.string().min(1),
    runs: z
      .object({
        crawler: z.string().nullable(),
        ba_session: z.string().nullable(),
        crawler_cli_session: z.string().nullable().optional(),
        ba_cli_session: z.string().nullable().optional(),
      })
      .strict(),
    conditions: z
      .object({
        session_timeout_s: z.number().int().positive().optional(),
        /** Only the crawler ran (`--crawler-only`): no BA, so no documentation scores. */
        crawler_only: z.boolean().optional(),
      })
      .strict()
      .optional(),
    cost: z
      .object({
        usd: z.number(),
        input_tokens: z.number(),
        output_tokens: z.number(),
        duration_ms: z.number(),
      })
      .strict(),
    scores: z.record(z.string(), Score),
    overclaims: z.number().int().min(0),
    checks: z.record(z.string(), z.union([z.boolean(), z.number()])),
    /** The trial's workspace (its store and documentation), so the outcome can be found again (spec 017 F-01). */
    workspace: z.string().min(1).optional(),
    judges: z.array(JudgeRunResult).optional(),
  })
  .strict();
export type EvalResult = z.infer<typeof EvalResult>;

/** Allowed drop per category, in percentage points (contracts: 0.05 recall → 5 points). */
export const Tolerances = z.record(z.string(), z.number().min(0));
export type Tolerances = z.infer<typeof Tolerances>;
export const DEFAULT_TOLERANCE = 5;

/** Checks that must be 0: any positive value is a regression, with or without a baseline (D6). */
export const HARD_ZERO_CHECKS = ['password_hits', 'widget_actions'] as const;

export interface Delta {
  name: string;
  baseline: number | boolean | null;
  current: number | boolean | null;
  change: number | null;
  regression: boolean;
}

export interface Comparison {
  deltas: Delta[];
  regressions: string[];
}

/**
 * Compare a result with the baseline (pure). A score regresses when it drops by more than its
 * tolerance; a boolean check regresses when it flips from true to false; over-claims regress when
 * they grow; a `HARD_ZERO_CHECKS` check above 0 always regresses. A category missing from the
 * baseline is new and never a regression.
 */
export function compareEval(
  current: EvalResult,
  baseline: EvalResult | null,
  tolerances: Tolerances = {},
): Comparison {
  const deltas: Delta[] = [];
  const names = [
    ...new Set([...Object.keys(current.scores), ...Object.keys(baseline?.scores ?? {})]),
  ].sort();
  for (const name of names) {
    const b = baseline?.scores[name]?.pct ?? null;
    const c = current.scores[name]?.pct ?? null;
    const tol = tolerances[name] ?? DEFAULT_TOLERANCE;
    const change = b === null || c === null ? null : Math.round((c - b) * 10) / 10;
    deltas.push({
      name,
      baseline: b,
      current: c,
      change,
      regression: b !== null && (c === null || c < b - tol),
    });
  }
  const bo = baseline?.overclaims ?? null;
  deltas.push({
    name: 'overclaims',
    baseline: bo,
    current: current.overclaims,
    change: bo === null ? null : current.overclaims - bo,
    regression: bo !== null && current.overclaims > bo,
  });
  deltas.push(...checkDeltas(current, baseline));
  return { deltas, regressions: deltas.filter((d) => d.regression).map((d) => d.name) };
}

function checkDeltas(current: EvalResult, baseline: EvalResult | null): Delta[] {
  const names = [
    ...new Set([...Object.keys(current.checks), ...Object.keys(baseline?.checks ?? {})]),
  ].sort();
  return names.map((name) => {
    const b = baseline?.checks[name] ?? null;
    const c = current.checks[name] ?? null;
    const hardZero = (HARD_ZERO_CHECKS as readonly string[]).includes(name);
    return {
      name: `check:${name}`,
      baseline: b,
      current: c,
      change: typeof b === 'number' && typeof c === 'number' ? c - b : null,
      regression: (b === true && c !== true) || (hardZero && typeof c === 'number' && c > 0),
    };
  });
}

const show = (v: number | boolean | null): string =>
  v === null ? '–' : typeof v === 'number' ? String(v) : v ? 'yes' : 'no';

/** The comparison as a Markdown table for stdout. */
export function comparisonMarkdown(current: EvalResult, cmp: Comparison): string {
  const lines = [
    `# Eval: ${current.portal_id} as ${current.persona_id} (${current.started_at})`,
    '',
    `runs: crawler ${current.runs.crawler ?? '–'}, BA ${current.runs.ba_session ?? '–'} · cost $${current.cost.usd.toFixed(2)}, ${current.cost.input_tokens + current.cost.output_tokens} tokens, ${Math.round(current.cost.duration_ms / 1000)} s`,
    ...(current.conditions?.session_timeout_s
      ? [`conditions: session timeout ${current.conditions.session_timeout_s} s`]
      : []),
    ...(current.conditions?.crawler_only ? ['conditions: crawler only (no BA)'] : []),
    '',
    '| Measure | Baseline | Now | Change | |',
    '| --- | --- | --- | --- | --- |',
    ...cmp.deltas.map(
      (d) =>
        `| ${d.name} | ${show(d.baseline)} | ${show(d.current)} | ${d.change === null ? '' : d.change > 0 ? `+${d.change}` : d.change} | ${d.regression ? '**regression**' : ''} |`,
    ),
    '',
    cmp.regressions.length === 0 ? 'No regression.' : `Regressions: ${cmp.regressions.join(', ')}`,
    ...judgeLines(current.judges ?? []),
  ];
  return `${lines.join('\n')}\n`;
}

/** Judges are reported, never compared (spec 017 research R5). */
function judgeLines(judges: readonly JudgeRunResult[]): string[] {
  if (judges.length === 0) return [];
  return [
    '',
    'Judges (model-based graders, not compared with the baseline):',
    ...judges.map(
      (j) =>
        `- ${j.id} (v${j.version}, ${j.calibrated ? 'calibrated' : 'uncalibrated'}): ${j.covered}/${j.total} (${j.pct} %), ` +
        `pass ${j.counts.pass} · fail ${j.counts.fail} · unknown ${j.counts.unknown} · error ${j.counts.error}, $${j.cost.usd.toFixed(3)}`,
    ),
  ];
}
