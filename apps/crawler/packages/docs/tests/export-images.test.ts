import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addEvidenceLink } from '@pathfinder/store';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportSrs, writeExport } from '../src/export.js';
import { highlightCrop } from '../src/render/images.js';
import { withLabel } from '../src/render/label-box.js';
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '../src/testing/index.js';

/** spec 008 US4 (FR-019–FR-021, SC-005): pictures in the SRS export, deterministic. */

const FIELD = 'spinbutton "Pojemność silnika (cm³)"';
let fx: FixtureStore;
let files: Map<string, string | Uint8Array>;
let scrKey: string;

beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seedDocRecords(fx);
  // A wireframe for the calculator state, and two regions on the latest DI-001 revision: one
  // with a box, one in the snapshot but not on the screenshot.
  const svg = await fx.evidence.storeText('<svg xmlns="http://www.w3.org/2000/svg"/>\n', 'svg');
  const exc = await fx.evidence.storeText('{"type":"excalidraw"}\n', 'excalidraw');
  fx.raw
    .prepare(`INSERT INTO state_wireframes VALUES (?, '1', ?, ?, '2026-01-15T10:00:00.000Z')`)
    .run(fx.states.vehicle, svg, exc);
  const rev = fx.raw
    .prepare(
      `SELECT v.id FROM doc_revisions v JOIN doc_records r ON r.id = v.record_id
       WHERE r.key = 'DI-001' AND v.rev_no = r.latest_rev`,
    )
    .get() as { id: string };
  const addRegion = (note: string | null, region: string) =>
    addEvidenceLink(fx.raw, rev.id, {
      target_kind: 'screen_region',
      target_id: fx.states.vehicle,
      run_id: fx.runId,
      note,
      region,
    });
  addRegion('the field', FIELD);
  addRegion(null, 'link "Kontakt"');
  files = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox', evidenceRoot: fx.evidenceDir });
  scrKey = (
    fx.raw
      .prepare(
        `SELECT r.key FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
         JOIN doc_evidence l ON l.revision_id = v.id
         WHERE r.kind = 'screen' AND l.target_kind = 'state' AND l.target_id = ? ORDER BY r.key`,
      )
      .get(fx.states.vehicle) as { key: string }
  ).key;
});
afterAll(() => fx.close());

const text = (name: string): string => files.get(name) as string;

describe('images in the SRS export', () => {
  it('copies the screen’s screenshot and wireframe files byte for byte', () => {
    const shot = readFileSync(fx.evidence.resolve(fx.visuals.vehicle.screenshot_ref));
    expect(files.get(`images/screens/${scrKey}.png`)).toEqual(new Uint8Array(shot));
    expect(files.has(`images/wireframes/${scrKey}.svg`)).toBe(true);
    expect(files.has(`images/wireframes/${scrKey}.excalidraw`)).toBe(true);
    const screens = text('03-screens.md');
    expect(screens).toContain(`](images/screens/${scrKey}.png)`);
    expect(screens).toContain(`](images/wireframes/${scrKey}.svg)`);
    expect(screens).toContain(`[edit in Excalidraw](images/wireframes/${scrKey}.excalidraw)`);
  });

  it('writes a highlight crop for a record with regions and lists them under it', () => {
    const crop = files.get('images/highlights/DI-001-1.png') as Uint8Array;
    const png = PNG.sync.read(Buffer.from(crop));
    // The field's box is (200,140) 160×20 on a 400×300 page; 120 px padding, clamped to the
    // image: x 80–400, y 20–280.
    expect([png.width, png.height]).toEqual([320, 260]);
    const dd = text('07-data-dictionary.md');
    expect(dd).toContain('](images/highlights/DI-001-1.png)');
    // Regions are numbered in link order (by element key within a state).
    expect(dd).toContain('1. `link "Kontakt"` _(not visible on the screenshot)_');
    expect(dd).toContain(`2. \`${FIELD}\` — the field`);
  });

  it('lists the visuals in records.json with export-relative paths', () => {
    const json = JSON.parse(text('records.json')) as {
      records: { key: string; visuals: { regions: { key: string; image: string | null }[] } }[];
    };
    const di = json.records.find((r) => r.key === 'DI-001')!;
    expect(di.visuals.regions).toEqual([
      expect.objectContaining({ key: 'link "Kontakt"', image: null }),
      expect.objectContaining({ key: FIELD, image: 'images/highlights/DI-001-1.png' }),
    ]);
  });

  it('every Markdown image link points at an exported file', () => {
    for (const [name, content] of files) {
      if (!name.endsWith('.md')) continue;
      for (const m of (content as string).matchAll(/\]\((images\/[^)]+)\)/g))
        expect(files.has(m[1]!), `${name} → ${m[1]}`).toBe(true);
    }
  });

  it('is deterministic, also on disk (FR-020)', () => {
    expect(
      exportSrs(fx.raw, fx.portalId, { environment: 'sandbox', evidenceRoot: fx.evidenceDir }),
    ).toEqual(files);
    const dir = mkdtempSync(join(tmpdir(), 'pf-srs-'));
    try {
      writeExport(join(dir, 'out'), files);
      for (const [name, content] of files) {
        const onDisk = readFileSync(join(dir, 'out', name));
        expect(new Uint8Array(onDisk), name).toEqual(
          typeof content === 'string' ? new Uint8Array(Buffer.from(content)) : content,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has no pictures without an evidence root, and says so', () => {
    const plain = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' });
    expect([...plain.keys()].some((k) => k.startsWith('images/'))).toBe(false);
    expect(plain.get('03-screens.md')).toContain('_No screenshot recorded._');
  });
});

describe('highlightCrop', () => {
  const page = (): Uint8Array => {
    const png = new PNG({ width: 300, height: 200 });
    png.data.fill(255);
    return new Uint8Array(PNG.sync.write(png));
  };

  it('outlines the box in the highlight colour and numbers it', () => {
    const crop = highlightCrop(
      page(),
      [
        {
          state_id: 's',
          key: 'k',
          note: null,
          n: 7,
          box: { x: 100, y: 80, width: 50, height: 20 },
        },
      ],
      10,
    );
    const png = PNG.sync.read(Buffer.from(crop));
    expect([png.width, png.height]).toEqual([70, 40]);
    const at = (x: number, y: number) => [
      ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3),
    ];
    expect(at(8, 20)).toEqual([0xe8, 0x59, 0x0c]); // left outline, 2 px left of the box
    expect(at(35, 20)).toEqual([255, 255, 255]); // inside the box: untouched
  });

  it('gives the same bytes for the same input', () => {
    const regions = [
      { state_id: 's', key: 'k', note: null, n: 12, box: { x: 10, y: 30, width: 40, height: 10 } },
    ];
    expect(highlightCrop(page(), regions)).toEqual(highlightCrop(page(), regions));
  });
});

describe('withLabel (spec 008 F-12)', () => {
  const radio = { x: 100, y: 50, width: 13, height: 13 };

  it('widens a radio box to the right so its label is inside', () => {
    const box = withLabel(radio, 'radio', 'OC + Autocasco', 1280)!;
    expect(box).toMatchObject({ x: 100, y: 50, height: 13 });
    // 13 px input + 8 px gap + 14 chars at 9 px
    expect(box.width).toBe(13 + 8 + 14 * 9);
  });

  it('a highlight crop of a radio then holds its label', () => {
    const png = new PNG({ width: 400, height: 100 });
    png.data.fill(255);
    const box = withLabel({ x: 20, y: 40, width: 13, height: 13 }, 'checkbox', 'Zgoda', 400)!;
    const crop = PNG.sync.read(
      Buffer.from(
        highlightCrop(new Uint8Array(PNG.sync.write(png)), [
          { state_id: 's', key: 'k', note: null, n: 1, box },
        ]),
      ),
    );
    expect(crop.width).toBeGreaterThanOrEqual(13 + 8 + 5 * 9);
  });

  it('stops at the page edge', () => {
    expect(withLabel({ ...radio, x: 1260 }, 'radio', 'a long label', 1280)!.width).toBe(20);
  });

  it('leaves other roles, nameless controls, wide boxes and missing boxes alone', () => {
    expect(withLabel(radio, 'button', 'OK', 1280)).toEqual(radio);
    expect(withLabel(radio, 'radio', ' ', 1280)).toEqual(radio);
    const card = { x: 0, y: 0, width: 300, height: 40 };
    expect(withLabel(card, 'radio', 'Pakiet Komfort', 1280)).toEqual(card);
    expect(withLabel(null, 'radio', 'x', 1280)).toBeNull();
  });
});
