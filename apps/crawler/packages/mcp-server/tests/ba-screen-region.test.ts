import { describe, expect, it } from 'vitest';
import { CONTENT, layerBCounts, startBa, type BaHarness } from './ba-harness.js';

/** spec 008 US2, contracts/ba-tools-delta.md: screen-region citations and the element list. */

const FIELD = 'spinbutton "Pojemność silnika (cm³)"';

const region = (h: BaHarness, key: string, over: Record<string, unknown> = {}) => ({
  target_kind: 'screen_region',
  target_id: h.fx.states.vehicle,
  region: key,
  note: 'the field on the calculator',
  ...over,
});

const rule = (h: BaHarness, session_id: string, evidence: unknown[]) => ({
  session_id,
  kind: 'business_rule',
  content: CONTENT.business_rule,
  confidence: 'observed',
  evidence,
});

describe('get_evidence on a state (elements for screen regions)', () => {
  it('lists the element keys, with box: true where the layout placed them', async () => {
    const h = await startBa();
    const out = await h.must('get_evidence', {
      target_kind: 'state',
      target_id: h.fx.states.vehicle,
    });
    expect(out.screenshot).toBe(true);
    expect(out.elements_truncated).toBe(false);
    const elements = out.elements as string[];
    const withoutBox = out.elements_without_box as string[];
    expect(elements.every((e) => typeof e === 'string')).toBe(true);
    expect(elements).toContain(FIELD);
    expect(withoutBox).not.toContain(FIELD);
    expect(elements).toContain('link "Kontakt"'); // in the snapshot, no box
    expect(withoutBox).toContain('link "Kontakt"');
    expect(withoutBox.every((k) => elements.includes(k))).toBe(true);
  });

  it('lists every element as without a box on a state without a screenshot', async () => {
    const h = await startBa();
    const out = await h.must('get_evidence', { target_kind: 'state', target_id: h.fx.states.car });
    expect(out.screenshot).toBe(false);
    expect(out.elements.length).toBeGreaterThan(0);
    expect(out.elements_without_box).toEqual(out.elements);
  });

  it('adds nothing to other kinds', async () => {
    const h = await startBa();
    const out = await h.must('get_evidence', {
      target_kind: 'form',
      target_id: h.fx.forms.vehicle,
    });
    expect(out).not.toHaveProperty('elements');
  });
});

describe('screen_region evidence (create_record / revise_record)', () => {
  it('stores the region and resolves its run like a state link', async () => {
    const h = await startBa();
    const s = await h.session();
    const { key } = await h.must('create_record', rule(h, s, [region(h, FIELD)]));
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key });
    expect(record.revisions[0].evidence).toEqual([
      {
        target_kind: 'screen_region',
        target_id: h.fx.states.vehicle,
        run_id: h.fx.runId,
        note: 'the field on the calculator',
        region: FIELD,
      },
    ]);
  });

  it('counts as observed evidence', async () => {
    const h = await startBa();
    const s = await h.session();
    const out = await h.call('create_record', rule(h, s, [region(h, FIELD)]));
    expect(out.isError).toBe(false);
  });

  it('accepts a key that has no box (not visible on the screenshot)', async () => {
    const h = await startBa();
    const s = await h.session();
    const out = await h.call('create_record', rule(h, s, [region(h, 'link "Kontakt"')]));
    expect(out.isError).toBe(false);
  });

  it('refuses a key the state does not have, naming the closest keys (UNKNOWN_REF)', async () => {
    const h = await startBa();
    const s = await h.session();
    const before = layerBCounts(h.fx);
    const error = await h.refused(
      'create_record',
      rule(h, s, [region(h, 'spinbutton "Pojemnosc silnika"')]),
    );
    expect(error.code).toBe('UNKNOWN_REF');
    expect(error.message).toContain(FIELD);
    expect(error.closest[0]).toBe(FIELD);
    expect(layerBCounts(h.fx)).toEqual(before);
  });

  it('requires region on a screen_region link and refuses it elsewhere (SCHEMA_INVALID)', async () => {
    const h = await startBa();
    const s = await h.session();
    const missing = await h.refused(
      'create_record',
      rule(h, s, [{ target_kind: 'screen_region', target_id: h.fx.states.vehicle }]),
    );
    expect(missing.code).toBe('SCHEMA_INVALID');
    expect(missing.message).toMatch(/region is required/);
    const misplaced = await h.refused(
      'create_record',
      rule(h, s, [{ target_kind: 'state', target_id: h.fx.states.vehicle, region: FIELD }]),
    );
    expect(misplaced.code).toBe('SCHEMA_INVALID');
    expect(misplaced.message).toMatch(/only accepted on a screen_region link/);
  });

  it('refuses a region of a state outside the session (RUN_NOT_IN_SESSION)', async () => {
    const h = await startBa();
    const { runId } = h.fx.addRun();
    const s = await h.session([runId]); // the new run saw only the home state
    const error = await h.refused('create_record', rule(h, s, [region(h, FIELD)]));
    expect(error.code).toBe('RUN_NOT_IN_SESSION');
  });

  it('keeps regions through revise_record', async () => {
    const h = await startBa();
    const s = await h.session();
    const { key } = await h.must('create_record', rule(h, s, [region(h, FIELD)]));
    await h.must('revise_record', {
      session_id: s,
      key,
      base_rev: 1,
      content: CONTENT.business_rule,
      confidence: 'observed',
      change_note: 'cite the button too',
      evidence: [region(h, FIELD), region(h, 'button "Dalej"', { note: undefined })],
    });
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key });
    expect(record.revisions[1].evidence.map((e: { region: string }) => e.region)).toEqual([
      FIELD,
      'button "Dalej"',
    ]);
  });
});
