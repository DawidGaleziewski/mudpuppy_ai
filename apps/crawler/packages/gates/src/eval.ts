import { z } from 'zod';

/** One category's score, as `docs:evaluate` reports it (pct 0–100). */
const Score = z.object({ matched: z.number(), total: z.number(), pct: z.number() }).strict();

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
      .object({ session_timeout_s: z.number().int().positive().optional() })
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
    '',
    '| Measure | Baseline | Now | Change | |',
    '| --- | --- | --- | --- | --- |',
    ...cmp.deltas.map(
      (d) =>
        `| ${d.name} | ${show(d.baseline)} | ${show(d.current)} | ${d.change === null ? '' : d.change > 0 ? `+${d.change}` : d.change} | ${d.regression ? '**regression**' : ''} |`,
    ),
    '',
    cmp.regressions.length === 0 ? 'No regression.' : `Regressions: ${cmp.regressions.join(', ')}`,
  ];
  return `${lines.join('\n')}\n`;
}
