import { describe, expect, it } from 'vitest';
import type { observePage } from '@pathfinder/crawler';
import { compositionHints, pageComposition } from '../src/runtime/pipeline/composition.js';
import { frameReports } from '../src/runtime/pipeline/frames.js';
import { ActionInput } from '../src/services/record-transition.js';

type Observed = Awaited<ReturnType<typeof observePage>>;

const frame = (over: Record<string, unknown> = {}) => ({
  path: '0',
  url: 'http://portal.test/inner?sid=fake',
  name: 'menu',
  title: 'Menu',
  origin: 'http://portal.test',
  observed: true,
  depth: 1,
  ...over,
});

const observed = (over: Record<string, unknown> = {}): Observed =>
  ({
    frames: [],
    framesSkipped: 0,
    clickables: { issued: [], found: 0, capped: 0 },
    ...over,
  }) as unknown as Observed;

describe('pageComposition', () => {
  it('maps frames, drops failed, keeps counts and leaves mounts and loaders empty', () => {
    const o = observed({
      frames: [frame(), frame({ path: '1', observed: false, failed: true })],
      framesSkipped: 2,
      clickables: { issued: [{}, {}, {}], found: 7, capped: 4 },
    });
    const c = pageComposition(o);
    expect(c.frames).toHaveLength(2);
    expect(c.frames[1]).not.toHaveProperty('failed');
    expect(c.frames[0]).toEqual(frame());
    expect(c.frames_skipped).toBe(2);
    expect(c.mounts).toEqual([]);
    expect(c.loaders).toEqual([]);
    expect(c.clickables).toEqual({ found: 7, issued: 3, capped: 4 });
  });

  it('is valid for a page without frames', () => {
    expect(pageComposition(observed()).frames).toEqual([]);
  });

  it('takes mounts, loaders and bundles from the mount wait of the settle', () => {
    const c = pageComposition(observed(), {
      mounts: [{ selector: '[data-mfe="shop"]', filled: true }],
      loaders: ['importmap'],
      bundles: ['http://127.0.0.1:4200/mfe/shop/index.js'],
      waitedMs: 412.6,
      timedOut: false,
    });
    expect(c.mounts).toEqual([
      {
        selector: '[data-mfe="shop"]',
        frame: '',
        filled: true,
        waited_ms: 413,
        bundles: ['http://127.0.0.1:4200/mfe/shop/index.js'],
      },
    ]);
    expect(c.loaders).toEqual(['importmap']);
  });
});

describe('compositionHints', () => {
  it('says nothing for a plain page', () => {
    expect(compositionHints(observed(), null)).toEqual({});
  });

  it('counts read frames and names mounts still empty after a timed-out wait', () => {
    const o = observed({ frames: [frame(), frame({ path: '1', observed: false })] });
    const hints = compositionHints(o, {
      mounts: [
        { selector: '#root', filled: false },
        { selector: '[data-mfe="cart"]', filled: true },
      ],
      loaders: ['systemjs'],
      bundles: [],
      waitedMs: 10_000,
      timedOut: true,
    });
    expect(hints).toEqual({ frames: 1, mounts_pending: ['#root'] });
  });
});

describe('frameReports', () => {
  it('reports unread frames with a shaped url and the depth overflow once', () => {
    const reports = frameReports(
      observed({
        frames: [
          frame(),
          frame({ path: '1', url: 'http://widget.test/c?token=fake', observed: false }),
          frame({ path: '2', observed: false, failed: true }),
        ],
        framesSkipped: 3,
      }),
    );
    expect(reports).toHaveLength(3);
    const text = JSON.stringify(reports);
    expect(text).toContain('cross_origin');
    expect(text).toContain('load_failed');
    expect(text).toContain('depth');
    expect(text).not.toContain('token=fake');
  });

  it('reports nothing when every frame was read', () => {
    expect(frameReports(observed({ frames: [frame()] }))).toEqual([]);
  });
});

describe('ActionInput (spec 015)', () => {
  it('accepts found_by, tag, frame and a path locator', () => {
    const parsed = ActionInput.parse({
      role: 'generic',
      accessible_name: 'Wykonaj',
      locators: [{ kind: 'path', value: 'body > div:nth-child(1)', rank: 0 }],
      found_by: ['listener', 'cursor'],
      tag: 'div',
      frame: '0/1',
    });
    expect(parsed.frame).toBe('0/1');
    expect(parsed.found_by).toEqual(['listener', 'cursor']);
  });

  it('rejects an empty found_by', () => {
    expect(() =>
      ActionInput.parse({
        role: 'generic',
        locators: [{ kind: 'path', value: 'x', rank: 0 }],
        found_by: [],
      }),
    ).toThrow();
  });
});
