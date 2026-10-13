import { describe, expect, it } from 'vitest';
import { amendmentOutcomes, type AmendmentAnchor, type ObservedState } from '../src/index.js';

const buyButton = {
  key: 'button "Buy now"',
  role: 'button',
  name: 'Buy now',
  roleIndex: 1,
};

const elements = [
  { key: 'heading "Car insurance"', role: 'heading', name: 'Car insurance' },
  { key: 'button "Back"', role: 'button', name: 'Back' },
  { key: 'button "Buy now"', role: 'button', name: 'Buy now' },
];

const noteOnState: AmendmentAnchor = {
  id: 'AMD-001',
  anchorFingerprint: 'fp-quote-v1',
  anchorRouteTemplate: '/car/quote',
  anchorElement: null,
};

const onButton: AmendmentAnchor = {
  id: 'AMD-002',
  anchorFingerprint: 'fp-quote-v1',
  anchorRouteTemplate: '/car/quote',
  anchorElement: buyButton,
};

function state(fingerprint: string, els = elements, stateId = `st-${fingerprint}`): ObservedState {
  return { stateId, fingerprint, routeTemplate: '/car/quote', elements: els };
}

describe('amendmentOutcomes (spec 022 R4: carry forward or re-anchor, never drop)', () => {
  it('page unchanged: nothing', () => {
    expect(amendmentOutcomes([noteOnState, onButton], [state('fp-quote-v1')])).toEqual([]);
  });

  it('screen not observed in a partial scan: nothing', () => {
    const other: ObservedState = { ...state('fp-home'), routeTemplate: '/' };
    expect(amendmentOutcomes([noteOnState, onButton], [other])).toEqual([]);
    expect(amendmentOutcomes([noteOnState, onButton], [])).toEqual([]);
  });

  it('page changed: a whole-screen note is carried forward to the new revision', () => {
    expect(amendmentOutcomes([noteOnState], [state('fp-quote-v2')])).toEqual([
      {
        amendmentId: 'AMD-001',
        outcome: 'carry_forward',
        successorStateId: 'st-fp-quote-v2',
        detail: 'the page at /car/quote changed; the note moves to its new revision',
      },
    ]);
  });

  it('page changed elsewhere but the element is still there: carried forward', () => {
    const more = [...elements, { key: 'link "Help"', role: 'link', name: 'Help' }];
    expect(amendmentOutcomes([onButton], [state('fp-quote-v2', more)])).toEqual([
      {
        amendmentId: 'AMD-002',
        outcome: 'carry_forward',
        successorStateId: 'st-fp-quote-v2',
        detail: 'the page at /car/quote changed; button "Buy now" is still there',
      },
    ]);
  });

  it('element renamed: needs re-anchoring, with the new name', () => {
    const renamed = [
      elements[0]!,
      elements[1]!,
      { key: 'button "Get a quote"', role: 'button', name: 'Get a quote' },
    ];
    expect(amendmentOutcomes([onButton], [state('fp-quote-v2', renamed)])).toEqual([
      {
        amendmentId: 'AMD-002',
        outcome: 'needs_reanchor',
        reason: 'element_changed',
        detail: 'button "Buy now" is now button "Get a quote"',
        successorStateId: 'st-fp-quote-v2',
      },
    ]);
  });

  it('element removed: needs re-anchoring', () => {
    const removed = [elements[0]!, elements[1]!];
    expect(amendmentOutcomes([onButton], [state('fp-quote-v2', removed)])).toMatchObject([
      {
        amendmentId: 'AMD-002',
        outcome: 'needs_reanchor',
        reason: 'element_removed',
        detail: 'button "Buy now" is no longer on the page',
      },
    ]);
  });

  it('a repeat suffix change is not a change', () => {
    const anchor: AmendmentAnchor = {
      ...onButton,
      anchorElement: { ...buyButton, key: 'button "Buy now"#2' },
    };
    expect(amendmentOutcomes([anchor], [state('fp-quote-v1')])).toEqual([]);
  });

  it('same fingerprint but a volatile name changed: only the element is checked', () => {
    const price = { key: 'button "Pay 100 zł"', role: 'button', name: 'Pay 100 zł', roleIndex: 0 };
    const anchor: AmendmentAnchor = { ...onButton, anchorElement: price };
    const now = [{ key: 'button "Pay 120 zł"', role: 'button', name: 'Pay 120 zł' }];
    expect(amendmentOutcomes([anchor], [state('fp-quote-v1', now)])).toMatchObject([
      {
        outcome: 'needs_reanchor',
        reason: 'element_changed',
        detail: 'button "Pay 100 zł" is now button "Pay 120 zł"',
      },
    ]);
  });

  it('one of several new revisions keeps the element: carried forward to that one', () => {
    const renamed = [{ key: 'button "Other"', role: 'button', name: 'Other' }];
    expect(
      amendmentOutcomes(
        [onButton],
        [state('fp-quote-v2', renamed), state('fp-quote-v3', elements)],
      ),
    ).toEqual([
      expect.objectContaining({ outcome: 'carry_forward', successorStateId: 'st-fp-quote-v3' }),
    ]);
  });

  it('several new revisions keep the anchor: a person picks (state_ambiguous)', () => {
    expect(amendmentOutcomes([noteOnState], [state('fp-quote-v2'), state('fp-quote-v3')])).toEqual([
      expect.objectContaining({
        outcome: 'needs_reanchor',
        reason: 'state_ambiguous',
        successorStateId: null,
      }),
    ]);
  });

  it('candidates without a layout cannot prove an element change: carried forward', () => {
    expect(amendmentOutcomes([onButton], [state('fp-quote-v2', [])])).toMatchObject([
      { outcome: 'carry_forward', successorStateId: 'st-fp-quote-v2' },
    ]);
    expect(amendmentOutcomes([onButton], [state('fp-quote-v1', [])])).toEqual([]);
  });

  it('another screen on the same route (another cluster) is not a candidate', () => {
    const own: AmendmentAnchor = { ...noteOnState, screenId: 'scr-form' };
    const errorView = { ...state('fp-quote-error'), screenId: 'scr-form-error' };
    expect(amendmentOutcomes([own], [errorView])).toEqual([]);
    const next = { ...state('fp-quote-v2'), screenId: 'scr-form' };
    expect(amendmentOutcomes([own], [errorView, next])).toMatchObject([
      { outcome: 'carry_forward', successorStateId: 'st-fp-quote-v2' },
    ]);
  });
});
