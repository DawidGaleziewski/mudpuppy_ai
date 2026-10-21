import { describe, expect, it } from 'vitest';
import { anchorReviews, type AnchorFacts } from '../src/index.js';

// Spec 039 T074 (design § 15): when an anchored amendment needs a person.

const facts = (over: Partial<AnchorFacts> = {}): AnchorFacts => ({
  screenKey: new Map([
    ['s1', 'SC-0001'],
    ['s2', 'SC-0002'],
  ]),
  lineage: new Map(),
  actions: new Map([['s1|button "Dalej"', ['active']]]),
  ...over,
});

describe('anchorReviews', () => {
  const anchor = { id: 'a1', screenId: 's1', elementKey: 'button "Dalej"' };

  it('leaves an anchor alone while its screen and element are there', () => {
    expect(anchorReviews([anchor], facts())).toEqual([]);
  });

  it('asks for a review when the screen was merged, split or retired', () => {
    const merged = facts({ lineage: new Map([['s1', { kind: 'merge', to: 's2' }]]) });
    expect(anchorReviews([anchor], merged)).toEqual([
      { id: 'a1', reason: 'screen_moved', detail: 'screen SC-0001 was merged into SC-0002' },
    ]);
    const retired = facts({ lineage: new Map([['s1', { kind: 'retire', to: null }]]) });
    expect(anchorReviews([anchor], retired)[0]?.detail).toBe('screen SC-0001 was retired');
  });

  it('asks for a review when every action on the element is not seen since', () => {
    const gone = facts({ actions: new Map([['s1|button "Dalej"', ['not_seen_since']]]) });
    expect(anchorReviews([anchor], gone)).toEqual([
      {
        id: 'a1',
        reason: 'element_gone',
        detail: 'button "Dalej" is no longer seen on screen SC-0001',
      },
    ]);
    const oneLeft = facts({
      actions: new Map([['s1|button "Dalej"', ['not_seen_since', 'active']]]),
    });
    expect(anchorReviews([anchor], oneLeft)).toEqual([]);
  });

  it('cannot tell for an element without actions or an anchor on the whole screen', () => {
    expect(
      anchorReviews([{ id: 'a2', screenId: 's1', elementKey: 'heading "Dane"' }], facts()),
    ).toEqual([]);
    expect(anchorReviews([{ id: 'a3', screenId: 's1', elementKey: null }], facts())).toEqual([]);
  });
});
