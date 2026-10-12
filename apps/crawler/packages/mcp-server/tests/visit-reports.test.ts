import { describe, expect, it } from 'vitest';
import { event } from '../src/runtime/pipeline/context.js';
import type { StepContext } from '../src/runtime/pipeline/context.js';
import { clientRedirectReports, mountReports } from '../src/runtime/pipeline/settle.js';
import { visitReports, visitVia } from '../src/runtime/pipeline/visits.js';

/** G-18: the report builders of the spec 019 steps are plain functions. */
describe('clientRedirectReports (spec 019 FR-007)', () => {
  it('reports nothing for a page that did not redirect itself', () => {
    expect(clientRedirectReports({ followed: 0, pending: null, capped: false })).toEqual([]);
  });

  it('reports the hops waited through, a capped loop, and a slow refresh left alone', () => {
    expect(clientRedirectReports({ followed: 2, pending: null, capped: false })).toEqual([
      event('client_redirect', { followed: 2, capped: false }),
    ]);
    expect(clientRedirectReports({ followed: 5, pending: null, capped: true })).toEqual([
      event('client_redirect', { followed: 5, capped: true }),
    ]);
    expect(
      clientRedirectReports({
        followed: 0,
        pending: { delayMs: 30000.2, target: 'http://h/logout' },
        capped: false,
      }),
    ).toEqual([
      event('client_redirect', {
        followed: 0,
        capped: false,
        pending_refresh: { delay_ms: 30000, target: 'http://h/logout' },
      }),
    ]);
  });
});

describe('visitReports and visitVia (spec 019)', () => {
  it('counts parameters and lists hop kinds, never values', () => {
    const r = visitReports(
      'http://h/a.do;jsessionid=S?konto=7&typ=M',
      [
        { url: 'http://h/menu.do', kind: 'start' },
        { url: 'http://h/a.do;jsessionid=S?konto=7&typ=M', kind: 'http', status: 302 },
      ],
      'action',
    );
    expect(r).toEqual([event('page_visit', { via: 'action', params: 3, hops: ['start', 'http'] })]);
    expect(JSON.stringify(r)).not.toContain('konto');
  });

  it('names how the page was reached', () => {
    const sc = (over: Partial<StepContext>) =>
      ({ via: { kind: 'navigate' }, ...over }) as StepContext;
    expect(visitVia(sc({}), false)).toBe('navigate');
    expect(visitVia(sc({ via: { kind: 'act', action: {} as never } }), false)).toBe('action');
    expect(visitVia(sc({ visitVia: 'login' }), false)).toBe('login');
    expect(visitVia(sc({ via: { kind: 'act', action: {} as never } }), true)).toBe('relogin');
  });
});

describe('mountReports with frames (spec 019 LO-53)', () => {
  it('names the frame whose mount stayed empty', () => {
    const probe = {
      mounts: [{ selector: '#app', filled: false }],
      loaders: ['importmap' as const],
      bundles: [],
    };
    const r = mountReports({
      mounts: [],
      loaders: [],
      bundles: [],
      waitedMs: 10000.4,
      timedOut: false,
      frames: [
        { url: 'http://pg.test/legacy/bank/kursy-app.do', probe, timedOut: true },
        { url: 'http://pg.test/ok', probe: { ...probe, mounts: [] }, timedOut: false },
      ],
    });
    expect(r).toEqual([
      event('mfe_mount_timeout', {
        selector: '#app',
        frame: 'http://pg.test/legacy/bank/kursy-app.do',
        waited_ms: 10000,
        bundles: 0,
      }),
    ]);
  });
});
