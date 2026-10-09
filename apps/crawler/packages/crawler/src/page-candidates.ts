import {
  attachLocators,
  clickableCandidates,
  extractCandidates,
  MAX_ACTIONS_PER_STATE,
  type CandidateAction,
} from './action-extractor.js';
import type { RankedLocator } from './locators.js';
import type { PageObservation } from './observer.js';

export interface PageCandidates {
  extracted: CandidateAction[];
  /** Ranked locators per candidate, same order as `extracted`. */
  locatorSets: RankedLocator[][];
}

/**
 * Every candidate action of an observed page, document by document (spec 015): the top document
 * first, then each read frame; within a document the ARIA candidates, then the role-less clickables.
 * `nth` counts per document, since `act` resolves inside that document. A frame's candidates carry
 * its path and start their container path with `iframe "<label>"`. The per-state cap spans all.
 */
export function extractPageCandidates(
  o: Pick<PageObservation, 'parts' | 'forms' | 'testIds' | 'clickables'>,
  mode: 'map' | 'trace',
): PageCandidates {
  const extracted: CandidateAction[] = [];
  const locatorSets: RankedLocator[][] = [];
  for (const part of o.parts) {
    const room = MAX_ACTIONS_PER_STATE - extracted.length;
    if (room <= 0) break;
    const frame = part.frame === '' ? undefined : part.frame;
    const forms = o.forms.filter((f) => f.frame === frame);
    const aria = extractCandidates(part.snapshot, forms, { mode }).slice(0, room);
    const clicks = clickableCandidates(
      o.clickables.issued.filter((c) => c.frame === frame),
      forms,
      room - aria.length,
    );
    const cands = [...aria, ...clicks].map((c) =>
      frame === undefined
        ? c
        : { ...c, frame, ancestors: [`iframe ${JSON.stringify(part.label)}`, ...c.ancestors] },
    );
    extracted.push(...cands);
    locatorSets.push(
      ...attachLocators(
        cands,
        o.testIds.filter((t) => t.frame === frame),
      ),
    );
  }
  return { extracted, locatorSets };
}
