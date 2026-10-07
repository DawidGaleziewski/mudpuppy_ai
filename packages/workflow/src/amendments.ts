// Which amendments a fresh run supersedes (R-30 FR-021, data-model.md "Change rule", research R8b).
// Pure: the chat service passes the portal's active amendments and the states the run observed,
// each with the keyed elements from its recorded layout, and writes the result in one transaction.
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
}

export type SupersededReason = 'state_replaced' | 'element_changed' | 'element_removed';

export interface Superseded {
  amendmentId: string;
  reason: SupersededReason;
  /** Short plain-language explanation for the "Superseded amendments" view. */
  detail: string;
  /** Observed state that replaced the anchor, when there is exactly one candidate. */
  successorStateId: string | null;
}

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

/**
 * For each active amendment:
 * 1. The run did not observe the route template at all: unchanged (a partial run says nothing).
 * 2. The run observed the anchor fingerprint: the page is the same; only an element whose name
 *    held volatile text can differ, so check the element and supersede only if it changed.
 * 3. The run observed the route template under other fingerprints only: the page changed
 *    (FR-021 a), so the amendment is superseded. The reason is refined from the element when the
 *    amendment targets one: removed, renamed, or still there (then `state_replaced`).
 * Layout-less states (no elements) cannot prove an element is gone, so they never yield an
 * element reason on their own.
 */
export function amendmentImpact(
  amendments: readonly AmendmentAnchor[],
  observed: readonly ObservedState[],
): Superseded[] {
  const byTemplate = new Map<string, ObservedState[]>();
  for (const s of observed) {
    const list = byTemplate.get(s.routeTemplate) ?? [];
    list.push(s);
    byTemplate.set(s.routeTemplate, list);
  }

  const out: Superseded[] = [];
  for (const a of amendments) {
    const candidates = byTemplate.get(a.anchorRouteTemplate);
    if (candidates === undefined) continue;
    const withLayout = candidates.filter((s) => s.elements.length > 0);
    const same = candidates.filter((s) => s.fingerprint === a.anchorFingerprint);

    if (same.length > 0) {
      const sameWithLayout = same.filter((s) => s.elements.length > 0);
      if (a.anchorElement === null || sameWithLayout.length === 0) continue;
      const verdict = elementVerdict(a.anchorElement, sameWithLayout);
      if (verdict !== null)
        out.push({
          amendmentId: a.id,
          ...verdict,
          successorStateId: same.length === 1 ? (same[0]?.stateId ?? null) : null,
        });
      continue;
    }

    const successorStateId = candidates.length === 1 ? (candidates[0]?.stateId ?? null) : null;
    const verdict =
      a.anchorElement !== null && withLayout.length > 0
        ? elementVerdict(a.anchorElement, withLayout)
        : null;
    out.push(
      verdict === null
        ? {
            amendmentId: a.id,
            reason: 'state_replaced',
            detail: `the page at ${a.anchorRouteTemplate} changed since the amendment was written`,
            successorStateId,
          }
        : { amendmentId: a.id, ...verdict, successorStateId },
    );
  }
  return out;
}
