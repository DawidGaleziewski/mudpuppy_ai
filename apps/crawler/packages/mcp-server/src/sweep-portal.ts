// What `pnpm model:sweep` runs (spec 080 FR-003, R-97 (4)): input sweeps on the headless driver.
// For each planned sweep (`pendingSweeps`), the recorded walk is replayed with the swept number at
// its minimum, 10 %, 25 %, 50 % and its maximum; between two neighbouring values whose pages show
// different values the gap is halved until the edge is two neighbouring numbers ("1400 → 1401").
// Each replay is one probe run (gated, recorded); each edge is a decision note `input_band`.
// A shown value that echoes the swept number is left out of the comparison (it changes with every
// value and is no band). A replay that diverges counts as no answer; the sweep goes on.

import {
  pendingSweeps,
  recordBand,
  shownOf,
  type InputBand,
  type SweepPlan,
} from '@mudpuppy/store';
import type { OpenedDb } from '@mudpuppy/store';
import type { ToolCall } from './local-client.js';
import { replay } from './replay-driver.js';

type Raw = OpenedDb['raw'];

/** Replays per sweep when no limit is given: a five-point grid and two edges halved down. */
export const SWEEP_REPLAYS = 40;

export interface SweepReport {
  sweeps: { label: string; replays: number; bands: InputBand[] }[];
  replays: number;
}

/** The grid: minimum, 10 %, 25 %, 50 %, maximum, whole numbers, each once. */
export function sweepGrid(min: number, max: number): number[] {
  const at = (f: number) => Math.round(min + (max - min) * f);
  return [...new Set([min, at(0.1), at(0.25), at(0.5), max])].sort((a, b) => a - b);
}

/** What a page showed, without the values that echo the swept number. */
const comparable = (shown: Record<string, string>, value: number): Record<string, string> =>
  Object.fromEntries(
    Object.entries(shown).filter(
      ([, v]) => Number(v.replace(/\s/g, '').replace(',', '.')) !== value,
    ),
  );

const sameShown = (a: Record<string, string>, b: Record<string, string>): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The band edges of one input, given what each value shows (null: no answer). */
export async function findBands(
  plan: Pick<SweepPlan, 'label' | 'attribute' | 'min' | 'max'>,
  show: (value: number) => Promise<Record<string, string> | null>,
  budget: number,
): Promise<{ bands: InputBand[]; asked: number }> {
  const seen = new Map<number, Record<string, string> | null>();
  const ask = async (v: number) => {
    if (!seen.has(v)) {
      if (seen.size >= budget) return null;
      const s = await show(v);
      seen.set(v, s && comparable(s, v));
    }
    return seen.get(v) ?? null;
  };
  const bands: InputBand[] = [];
  const split = async (lo: number, hi: number): Promise<void> => {
    const [a, b] = [await ask(lo), await ask(hi)];
    if (!a || !b || sameShown(a, b)) return;
    if (hi - lo <= 1) {
      const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
        (n) => a[n] !== b[n],
      );
      bands.push({
        label: plan.label,
        attribute: plan.attribute,
        below: lo,
        above: hi,
        changed: names.map((name) => ({ name, below: a[name] ?? '', above: b[name] ?? '' })),
      });
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    await split(lo, mid);
    await split(mid, hi);
  };
  const grid = sweepGrid(plan.min, plan.max);
  for (let i = 0; i + 1 < grid.length; i++) await split(grid[i]!, grid[i + 1]!);
  return { bands, asked: seen.size };
}

export async function sweepPortal(
  call: ToolCall,
  raw: Raw,
  portal: string,
  opts: { limit?: number; sweeps?: number } = {},
): Promise<SweepReport> {
  const report: SweepReport = { sweeps: [], replays: 0 };
  for (const plan of pendingSweeps(raw, portal, { limit: opts.sweeps })) {
    const runs = new Map<number, string>();
    const show = async (value: number) => {
      const r = await replay(call, {
        ...plan,
        inputs: { ...plan.inputs, [plan.attribute]: String(value) },
      });
      report.replays += 1;
      if (r.status !== 'reached') return null;
      runs.set(value, r.runId);
      return shownOf(raw, r.runId);
    };
    const { bands, asked } = await findBands(plan, show, opts.limit ?? SWEEP_REPLAYS);
    for (const b of bands) recordBand(raw, runs.get(b.above)!, b);
    report.sweeps.push({ label: plan.label, replays: asked, bands });
  }
  return report;
}
