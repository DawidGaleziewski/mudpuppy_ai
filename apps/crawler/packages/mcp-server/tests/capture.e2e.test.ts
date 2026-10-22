import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { Layout } from '@mudpuppy/core';
import { canLaunchBrowser, pngSize } from '@mudpuppy/crawler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crawl, startHarness, type Call } from './harness.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { portalYaml } from './trace-run-harness.js';

const available = await canLaunchBrowser();
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal();
});
afterAll(async () => portal?.close());

type Row = Record<string, unknown>;

async function mapRun(call: Call, steps: number): Promise<string> {
  const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
  if (start.isError) throw new Error(JSON.stringify(start.body));
  const runId = start.body.run_id as string;
  await call('navigate', { run_id: runId, url: `${portal.origin}/`, rationale: 'base URL' });
  await crawl(call, runId, steps);
  await call('finish_run', { run_id: runId, rationale: 'enough for the test' });
  return runId;
}

describe.skipIf(!available)(
  'state visuals in map runs (spec 008 US1, FR-005, FR-008, FR-009)',
  () => {
    it('captures a screenshot and layout for every new state, once', async () => {
      const h = await startHarness({
        'portals/mock/portal.yaml': portalYaml(portal.origin, 40),
        'personas/mock/guest.yaml': PERSONA,
      });
      try {
        const first = await mapRun(h.call, 4);
        const states = h.ctx.raw
          .prepare('SELECT id, screenshot_ref, layout_ref FROM states')
          .all() as Row[];
        expect(states.length).toBeGreaterThan(1);
        for (const s of states) {
          expect(s.screenshot_ref).toMatch(/^[0-9a-f]{64}\.png$/);
          expect(s.layout_ref).toMatch(/^[0-9a-f]{64}\.json$/);
          const png = readFileSync(h.ctx.evidence.resolve(s.screenshot_ref as string));
          const layout = Layout.parse(
            JSON.parse(readFileSync(h.ctx.evidence.resolve(s.layout_ref as string), 'utf8')),
          );
          expect(pngSize(png)).toEqual(layout.page);
          expect(layout.page.width).toBe(1280);
          expect(layout.elements.length).toBeGreaterThan(0);
        }
        // Every new state also has a wireframe drawn from its snapshot (spec 008 FR-014).
        const wireframes = h.ctx.raw
          .prepare(
            'SELECT state_id, generator_version, svg_ref, excalidraw_ref FROM state_wireframes',
          )
          .all() as Row[];
        expect(wireframes.map((w) => w.state_id).sort()).toEqual(states.map((s) => s.id).sort());
        const svg = readFileSync(h.ctx.evidence.resolve(wireframes[0]!.svg_ref as string), 'utf8');
        expect(svg).toMatch(/^<svg /);
        expect(
          JSON.parse(
            readFileSync(h.ctx.evidence.resolve(wireframes[0]!.excalidraw_ref as string), 'utf8'),
          ).type,
        ).toBe('excalidraw');
        const captured = (runId: string) =>
          (
            h.ctx.raw
              .prepare(
                "SELECT count(*) AS n FROM trace_spans WHERE run_id = ? AND name = 'visuals_captured'",
              )
              .get(runId) as { n: number }
          ).n;
        expect(captured(first)).toBe(states.length);

        // A second run over the same pages records no new screenshot (known states keep theirs).
        const pngsBefore = readdirSync(h.ctx.evidence.root).filter((f) => f.endsWith('.png'));
        const second = await mapRun(h.call, 4);
        expect(captured(second)).toBe(0);
        const after = h.ctx.raw
          .prepare(
            'SELECT id, screenshot_ref FROM states WHERE id IN (' +
              states.map(() => '?').join(',') +
              ')',
          )
          .all(...states.map((s) => s.id)) as Row[];
        expect(after.map((s) => s.screenshot_ref).sort()).toEqual(
          states.map((s) => s.screenshot_ref).sort(),
        );
        expect(readdirSync(h.ctx.evidence.root).filter((f) => f.endsWith('.png')).length).toBe(
          pngsBefore.length,
        );
      } finally {
        await h.cleanup();
      }
    }, 60_000);

    it('keeps the state and warns when the capture fails', async () => {
      const h = await startHarness({
        'portals/mock/portal.yaml': portalYaml(portal.origin, 10),
        'personas/mock/guest.yaml': PERSONA,
      });
      h.ctx.captureVisuals = async () => {
        throw new Error('page closed during capture');
      };
      try {
        const runId = await mapRun(h.call, 1);
        const states = h.ctx.raw.prepare('SELECT screenshot_ref FROM states').all() as Row[];
        expect(states.length).toBeGreaterThan(0);
        expect(states.every((s) => s.screenshot_ref === null)).toBe(true);
        const warnings = h.ctx.raw
          .prepare(
            "SELECT rule, reason FROM decision_log WHERE run_id = ? AND rule = 'capture_failed'",
          )
          .all(runId) as Row[];
        expect(warnings.length).toBe(states.length);
        expect(String(warnings[0]!.reason)).toContain('page closed during capture');
        const run = h.ctx.raw.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as Row;
        expect(run.status).not.toBe('failed');
        expect(existsSync(h.ctx.evidence.root)).toBe(true);
      } finally {
        await h.cleanup();
      }
    }, 60_000);
  },
);
