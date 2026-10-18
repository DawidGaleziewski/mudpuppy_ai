/**
 * The stopping rule for a process (spec 039 design § 14.2): depth 1 (every action class of every
 * member screen executed once per audience), depth 2 (every pair of consecutive action classes),
 * then random walks. Explored when a full pass finds no new deviation; the documentation states
 * the bound. Pure.
 */
import { MODEL_DEFAULTS } from '../defaults.js';
import { compare } from '../model/clustering.js';

export interface ProcessClass {
  id: string;
  screen: string;
  /** The screen the action leads to (from the model transitions), null when unknown. */
  leadsTo: string | null;
}

export interface ExplorationGaps {
  /** Action classes not yet executed, per audience (`audience\u0000class`). */
  depth1: string[];
  /** Pairs (a then b on a's target) not yet executed (`a\u0000b`). */
  depth2: string[];
}

/** What depth 1 and depth 2 still miss for a process, given what was executed. */
export function explorationGaps(
  classes: readonly ProcessClass[],
  audiences: readonly string[],
  executed: ReadonlySet<string>,
  executedPairs: ReadonlySet<string>,
): ExplorationGaps {
  const depth1: string[] = [];
  for (const audience of [...audiences].sort(compare))
    for (const c of [...classes].sort((a, b) => compare(a.id, b.id)))
      if (!executed.has(`${audience}\u0000${c.id}`)) depth1.push(`${audience}\u0000${c.id}`);
  const byScreen = new Map<string, ProcessClass[]>();
  for (const c of classes) byScreen.set(c.screen, [...(byScreen.get(c.screen) ?? []), c]);
  const depth2: string[] = [];
  for (const a of [...classes].sort((x, y) => compare(x.id, y.id))) {
    if (a.leadsTo === null) continue;
    for (const b of (byScreen.get(a.leadsTo) ?? []).sort((x, y) => compare(x.id, y.id)))
      if (!executedPairs.has(`${a.id}\u0000${b.id}`)) depth2.push(`${a.id}\u0000${b.id}`);
  }
  return { depth1, depth2 };
}

/** The sentence the process documentation states (design § 14.2). */
export function explorationBound(e: {
  depth: number;
  randomWalks: number;
  builds: readonly string[];
  newDeviations: number;
}): string {
  const builds = e.builds.length > 0 ? ` on builds ${[...e.builds].sort(compare).join(', ')}` : '';
  const walks = e.randomWalks > 0 ? ` plus ${e.randomWalks} random walks` : '';
  const found = e.newDeviations === 0 ? 'no counterexamples' : `${e.newDeviations} new deviations`;
  return `Explored to depth ${e.depth}${walks}${builds}; ${found}.`;
}

/** The full pass's parameters (design § 14.2), from the model defaults. */
export const EXPLORATION = MODEL_DEFAULTS.exploration;
