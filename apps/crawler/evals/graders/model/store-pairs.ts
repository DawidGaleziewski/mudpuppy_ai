/**
 * A judge's pairs from one store (spec 017 research R7): any store with documentation, the main
 * one or a trial's workspace. Opened read-only; nothing is written.
 */
import { existsSync } from 'node:fs';
import { loadEvalInput, type GroundTruth } from '@mudpuppy/docs';
import { openDb } from '@mudpuppy/store';
import type { JudgeDefinition, Pair } from './definition.js';

export interface StorePairs {
  /** Every ground-truth item of the judge's category, with or without candidates. */
  itemIds: string[];
  pairs: Pair[];
  records: number;
}

/** The ids of the ground-truth items a judge scores (every entry of its category has an `id`). */
export function categoryItemIds(def: JudgeDefinition, gt: GroundTruth): string[] {
  const items: unknown = gt[def.category];
  if (!Array.isArray(items)) return [];
  return items.flatMap((x: unknown) =>
    x && typeof x === 'object' && 'id' in x && typeof x.id === 'string' ? [x.id] : [],
  );
}

export async function pairsFromStore(
  def: JudgeDefinition,
  storePath: string,
  portal: string,
  groundTruth: GroundTruth,
): Promise<StorePairs> {
  if (!existsSync(storePath)) throw new Error(`no store at ${storePath}`);
  const opened = openDb(storePath);
  try {
    opened.raw.pragma('query_only = ON');
    const { records } = loadEvalInput(opened.raw, portal);
    return {
      itemIds: categoryItemIds(def, groundTruth),
      pairs: def.selectPairs({ groundTruth, records }),
      records: records.length,
    };
  } finally {
    await opened.close();
  }
}
