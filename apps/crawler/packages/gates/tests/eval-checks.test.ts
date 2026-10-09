import { describe, expect, it } from 'vitest';
import {
  crawlScreens,
  frameRoutes,
  passwordHits,
  widgetActions,
  type GtScreen,
} from '../src/eval-checks.js';

const screens: GtScreen[] = [
  { id: 'S1', route_template: '/', guest_visible: true, actor: 'guest' },
  { id: 'S2', route_template: '/quote', guest_visible: true, actor: 'guest' },
  { id: 'S3', route_template: '/account', guest_visible: false, actor: 'customer' },
  { id: 'S4', route_template: '/admin', guest_visible: false },
];

describe('frameRoutes (spec 015)', () => {
  it('takes the path of every read http frame, without path parameters or query', () => {
    const c = JSON.stringify({
      frames: [
        { url: 'http://h/legacy/bank/historia.do;jsessionid=abc', observed: true },
        { url: 'http://h/legacy/bank/lista.do;jsessionid=abc?strona=2', observed: true },
        { url: 'about:srcdoc', observed: true },
        { url: 'http://other/widget', observed: false },
      ],
    });
    expect(frameRoutes([c, null, 'not json']).sort()).toEqual([
      '/legacy/bank/historia.do',
      '/legacy/bank/lista.do',
    ]);
  });

  it('lets crawlScreens count a screen reached only inside a frame', () => {
    const legacy: GtScreen[] = [
      { id: 'S08', route_template: '/legacy/bank/historia.do', guest_visible: false, actor: 'c' },
    ];
    const routes = frameRoutes([
      JSON.stringify({ frames: [{ url: 'http://h/legacy/bank/historia.do;x=1', observed: true }] }),
    ]);
    expect(crawlScreens(legacy, ['/bank/historia', ...routes], true).matched).toBe(1);
  });
});

describe('crawlScreens route matching (spec 015 F-18)', () => {
  it('ignores a query kept in a crawled hash route', () => {
    const gt: GtScreen[] = [
      { id: 'S07', route_template: '/u#/szkody/potwierdzenie', guest_visible: false, actor: 'c' },
    ];
    expect(crawlScreens(gt, ['/u#/szkody/potwierdzenie?nr=SZ%2F2026%2F0001'], true).matched).toBe(
      1,
    );
  });
});

describe('crawlScreens', () => {
  it('scores the guest set by guest_visible', () => {
    const r = crawlScreens(screens, ['/', '/account'], false);
    expect(r).toEqual({ matched: 1, total: 2, pct: 50, missing: ['S2'] });
  });

  it('scores the logged-in set by a non-guest actor', () => {
    const r = crawlScreens(screens, ['/account', '/'], true);
    expect(r).toEqual({ matched: 1, total: 1, pct: 100, missing: [] });
  });

  it('does not match a near-miss route and lists it as missing', () => {
    const r = crawlScreens(screens, ['/', '/quote/'], false);
    expect(r.matched).toBe(1);
    expect(r.missing).toEqual(['S2']);
  });

  it('matches routes whose parameters are named differently (F-06)', () => {
    const product: GtScreen[] = [
      { id: 'P', route_template: '/shop/product/:slug', guest_visible: true },
      { id: 'D', route_template: '/policy#/:nr/extras', guest_visible: true },
    ];
    const r = crawlScreens(product, ['/shop/product/:param', '/policy#/:param/extras'], false);
    expect(r.missing).toEqual([]);
    expect(crawlScreens(product, ['/shop/product/boots'], false).missing).toEqual(['P', 'D']);
  });

  it('rounds to one decimal', () => {
    const three: GtScreen[] = ['a', 'b', 'c'].map((x) => ({
      id: x,
      route_template: `/${x}`,
      guest_visible: true,
    }));
    expect(crawlScreens(three, ['/a'], false).pct).toBe(33.3);
  });

  it('gives 0 for empty ground truth', () => {
    expect(crawlScreens([], ['/'], false)).toEqual({ matched: 0, total: 0, pct: 0, missing: [] });
  });
});

describe('passwordHits', () => {
  const secret = 'test-pass-not-real';

  it('counts occurrences per place, several in one place, and lists only places with hits', () => {
    const r = passwordHits(
      [
        { place: 'db', text: `a ${secret} b ${secret}` },
        { place: 'log', text: 'clean' },
        { place: 'har', text: secret },
      ],
      [secret],
    );
    expect(r).toEqual({ total: 3, byPlace: { db: 2, har: 1 } });
  });

  it('ignores empty and short secrets', () => {
    const r = passwordHits([{ place: 'db', text: 'aaa abc  x' }], ['', 'a', 'abc']);
    expect(r).toEqual({ total: 0, byPlace: {} });
  });

  it('never returns the secret text', () => {
    const r = passwordHits([{ place: 'db', text: secret }], [secret]);
    expect(JSON.stringify(r)).not.toContain(secret);
  });
});

describe('widgetActions', () => {
  it('counts edges naming the widget host or recaptcha, and widget calls', () => {
    const n = widgetActions({
      edgeActions: [
        '{"click":"http://127.0.0.1:4101/widget"}',
        '{"frame":"reCAPTCHA challenge"}',
        '{"click":"Submit"}',
      ],
      actionCalls: [
        '/widget/recaptcha/api2/userverify',
        '/api/quote',
        '/widget/recaptcha/api2/payload',
      ],
    });
    expect(n).toBe(4);
  });

  it('is 0 for unrelated edges and calls', () => {
    expect(
      widgetActions({ edgeActions: ['{"click":"Next"}'], actionCalls: ['/api/policies'] }),
    ).toBe(0);
  });
});
