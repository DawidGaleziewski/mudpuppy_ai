// What a fresh scan does to each amendment (R-30 FR-021; spec 022 R4, FE-S02): nothing, carry it
// forward to the screen's new revision, or flag it for re-anchoring. Amendments are never dropped.
// Pure: the chat service passes the portal's active amendments and the states the run observed,
// each with the keyed elements from its recorded layout, and writes revisions in one transaction.
//
// How the recorded data behaves (checked in T011 against fingerprint/ and core/element-key.ts):
// - A state's level-1 fingerprint hashes the route template plus the canonical ARIA tree with
//   accessible names, so a renamed, added or removed element gives a new fingerprint and a new
//   state row under the same route template. "Same fingerprint observed" therefore means the page
//   is unchanged apart from masked volatile text (prices, counters, dates).
// - Element keys are `role "name"` (`#n` for repeats) in document order; wireframe shapes carry the
//   same key, so the key is the wireframe element id.

export interface AnchorElement {
  key: string;
  role: string;
  name: string;
  /** 0-based position among elements with the same role on the anchor state. */
  roleIndex: number;
}

export interface AmendmentAnchor {
  id: string;
  anchorFingerprint: string;
  anchorRouteTemplate: string;
  anchorElement: AnchorElement | null;
  /** The screen (route + cluster, spec 022 R1) the amendment belongs to; null before 0015. */
  screenId?: string | null;
}

export interface ObservedElement {
  key: string;
  role: string;
  name: string;
}

export interface ObservedState {
  stateId: string;
  fingerprint: string;
  routeTemplate: string;
  /** Keyed elements from the state's layout, in document order; empty when no layout exists. */
  elements: readonly ObservedElement[];
  /** The state's screen (spec 022 R1); when both sides know it, candidates must share it. */
  screenId?: string | null;
}

export type ReanchorReason = 'element_changed' | 'element_removed' | 'state_ambiguous';

/** The scan changed the page, and the amendment's anchor is still there: it moves along. */
export interface CarriedForward {
  amendmentId: string;
  outcome: 'carry_forward';
  successorStateId: string;
  detail: string;
}

/** The anchor is gone or cannot be told apart: a person picks the new anchor (Review). */
export interface NeedsReanchor {
  amendmentId: string;
  outcome: 'needs_reanchor';
  reason: ReanchorReason;
  /** Short plain-language explanation for the Review inbox. */
  detail: string;
  /** Observed state that replaced the anchor, when there is exactly one candidate. */
  successorStateId: string | null;
}

export type AmendmentOutcome = CarriedForward | NeedsReanchor;

type ElementMatch =
  { kind: 'present' } | { kind: 'changed'; now: ObservedElement } | { kind: 'removed' };

function matchElement(anchor: AnchorElement, elements: readonly ObservedElement[]): ElementMatch {
  if (elements.some((e) => e.key === anchor.key)) return { kind: 'present' };
  // Same role and name under another `#n` suffix: an earlier repeat was added or removed.
  if (elements.some((e) => e.role === anchor.role && e.name === anchor.name))
    return { kind: 'present' };
  const sameRole = elements.filter((e) => e.role === anchor.role);
  const atPosition = sameRole[anchor.roleIndex];
  if (atPosition !== undefined) return { kind: 'changed', now: atPosition };
  return { kind: 'removed' };
}

function describe(el: { role: string; name: string }): string {
  return el.name === '' ? el.role : `${el.role} "${el.name}"`;
}

function elementVerdict(
  anchor: AnchorElement,
  states: readonly ObservedState[],
): { reason: 'element_changed' | 'element_removed'; detail: string } | null {
  // The element is fine if any candidate still has it; otherwise report the most specific change.
  const matches = states.map((s) => matchElement(anchor, s.elements));
  if (matches.some((m) => m.kind === 'present')) return null;
  const changed = matches.find((m) => m.kind === 'changed');
  if (changed?.kind === 'changed')
    return {
      reason: 'element_changed',
      detail: `${describe(anchor)} is now ${describe(changed.now)}`,
    };
  return {
    reason: 'element_removed',
    detail: `${describe(anchor)} is no longer on the page`,
  };
}

/** The run's states that can stand in for the amendment's screen. */
function candidatesFor(a: AmendmentAnchor, observed: readonly ObservedState[]): ObservedState[] {
  return observed.filter(
    (s) =>
      s.routeTemplate === a.anchorRouteTemplate &&
      (a.screenId == null || s.screenId == null || s.screenId === a.screenId),
  );
}

function hasElement(anchor: AnchorElement, s: ObservedState): boolean {
  return matchElement(anchor, s.elements).kind === 'present';
}

/**
 * For each active amendment:
 * 1. The run did not observe its screen at all: nothing (a partial run says nothing).
 * 2. The run observed the anchor fingerprint: the page is the same; only an element whose name
 *    held volatile text can differ, so check the element and ask for re-anchoring only if it
 *    changed.
 * 3. The run observed the screen under other fingerprints only: the page changed. The amendment
 *    is carried forward to the one new revision that still has its anchor (any state for a
 *    whole-screen note; one that keeps the element for an element note). With several such
 *    revisions it needs re-anchoring (`state_ambiguous`); with the element renamed or gone too
 *    (`element_changed`, `element_removed`).
 * Layout-less states (no elements) cannot prove an element is gone, so they count as keeping it.
 */
export function amendmentOutcomes(
  amendments: readonly AmendmentAnchor[],
  observed: readonly ObservedState[],
): AmendmentOutcome[] {
  const out: AmendmentOutcome[] = [];
  for (const a of amendments) {
    const candidates = candidatesFor(a, observed);
    if (candidates.length === 0) continue;
    const same = candidates.filter((s) => s.fingerprint === a.anchorFingerprint);
    const outcome = same.length > 0 ? unchangedPage(a, same) : changedPage(a, candidates);
    if (outcome !== null) out.push(outcome);
  }
  return out;
}

/** Case 2: the anchor's page was seen again; only a volatile element name can have moved on. */
function unchangedPage(a: AmendmentAnchor, same: readonly ObservedState[]): NeedsReanchor | null {
  const withLayout = same.filter((s) => s.elements.length > 0);
  if (a.anchorElement === null || withLayout.length === 0) return null;
  const verdict = elementVerdict(a.anchorElement, withLayout);
  if (verdict === null) return null;
  return {
    amendmentId: a.id,
    outcome: 'needs_reanchor',
    ...verdict,
    successorStateId: same.length === 1 ? (same[0]?.stateId ?? null) : null,
  };
}

/** Case 3: the page changed; carry forward to the one revision that keeps the anchor. */
function changedPage(
  a: AmendmentAnchor,
  candidates: readonly ObservedState[],
): AmendmentOutcome | null {
  const anchor = a.anchorElement;
  const keeping =
    anchor === null
      ? candidates
      : candidates.filter((s) => s.elements.length === 0 || hasElement(anchor, s));
  const [target] = keeping;
  if (keeping.length === 1 && target !== undefined)
    return {
      amendmentId: a.id,
      outcome: 'carry_forward',
      successorStateId: target.stateId,
      detail: `the page at ${a.anchorRouteTemplate} changed; ${anchor === null ? 'the note moves to its new revision' : `${describe(anchor)} is still there`}`,
    };
  if (keeping.length > 1)
    return {
      amendmentId: a.id,
      outcome: 'needs_reanchor',
      reason: 'state_ambiguous',
      detail: `the page at ${a.anchorRouteTemplate} now has ${String(keeping.length)} versions; pick the one the amendment belongs to`,
      successorStateId: null,
    };
  // Every candidate has a layout and none keeps the element (a whole-screen note always has
  // candidates to keep, so it never gets this far).
  if (anchor === null) return null;
  return {
    amendmentId: a.id,
    outcome: 'needs_reanchor',
    ...(elementVerdict(anchor, candidates) ?? {
      reason: 'element_removed' as const,
      detail: `${describe(anchor)} is no longer on the page`,
    }),
    successorStateId: candidates.length === 1 ? (candidates[0]?.stateId ?? null) : null,
  };
}
