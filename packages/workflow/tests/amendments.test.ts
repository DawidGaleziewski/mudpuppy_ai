import { describe, expect, it } from 'vitest';
import { amendmentImpact, type AmendmentAnchor, type ObservedState } from '../src/index.js';

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

describe('amendmentImpact', () => {
  it('state untouched: nothing superseded', () => {
    expect(amendmentImpact([noteOnState, onButton], [state('fp-quote-v1')])).toEqual([]);
  });

  it('state not observed in a partial run: nothing superseded', () => {
    const other: ObservedState = { ...state('fp-home'), routeTemplate: '/' };
    expect(amendmentImpact([noteOnState, onButton], [other])).toEqual([]);
    expect(amendmentImpact([noteOnState, onButton], [])).toEqual([]);
  });

  it('state replaced: a state-level note is superseded with the successor', () => {
    expect(amendmentImpact([noteOnState], [state('fp-quote-v2')])).toEqual([
      {
        amendmentId: 'AMD-001',
        reason: 'state_replaced',
        detail: 'the page at /car/quote changed since the amendment was written',
        successorStateId: 'st-fp-quote-v2',
      },
    ]);
  });

  it('page changed elsewhere but the element is still there: state_replaced', () => {
    const more = [...elements, { key: 'link "Help"', role: 'link', name: 'Help' }];
    expect(amendmentImpact([onButton], [state('fp-quote-v2', more)])).toMatchObject([
      { amendmentId: 'AMD-002', reason: 'state_replaced' },
    ]);
  });

  it('element renamed: element_changed with the new name', () => {
    const renamed = [
      elements[0]!,
      elements[1]!,
      { key: 'button "Get a quote"', role: 'button', name: 'Get a quote' },
    ];
    expect(amendmentImpact([onButton], [state('fp-quote-v2', renamed)])).toEqual([
      {
        amendmentId: 'AMD-002',
        reason: 'element_changed',
        detail: 'button "Buy now" is now button "Get a quote"',
        successorStateId: 'st-fp-quote-v2',
      },
    ]);
  });

  it('element removed: element_removed', () => {
    const removed = [elements[0]!, elements[1]!];
    expect(amendmentImpact([onButton], [state('fp-quote-v2', removed)])).toMatchObject([
      {
        amendmentId: 'AMD-002',
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
    expect(amendmentImpact([anchor], [state('fp-quote-v1')])).toEqual([]);
  });

  it('same fingerprint but a volatile name changed: only the element is checked', () => {
    const price = {
      key: 'button "Pay 100 zł"',
      role: 'button',
      name: 'Pay 100 zł',
      roleIndex: 0,
    };
    const anchor: AmendmentAnchor = { ...onButton, anchorElement: price };
    const now = [{ key: 'button "Pay 120 zł"', role: 'button', name: 'Pay 120 zł' }];
    expect(amendmentImpact([anchor], [state('fp-quote-v1', now)])).toMatchObject([
      {
        reason: 'element_changed',
        detail: 'button "Pay 100 zł" is now button "Pay 120 zł"',
      },
    ]);
  });

  it('several candidate states: no single successor, element kept if any still has it', () => {
    const renamed = [{ key: 'button "Other"', role: 'button', name: 'Other' }];
    const result = amendmentImpact(
      [onButton],
      [state('fp-quote-v2', renamed), state('fp-quote-v3', elements)],
    );
    expect(result).toEqual([
      expect.objectContaining({
        reason: 'state_replaced',
        successorStateId: null,
      }),
    ]);
  });

  it('candidates without a layout cannot prove an element change', () => {
    expect(amendmentImpact([onButton], [state('fp-quote-v2', [])])).toMatchObject([
      { reason: 'state_replaced' },
    ]);
    expect(amendmentImpact([onButton], [state('fp-quote-v1', [])])).toEqual([]);
  });
});
