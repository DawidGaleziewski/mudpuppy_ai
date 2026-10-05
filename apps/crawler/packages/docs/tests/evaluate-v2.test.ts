import { describe, expect, it } from 'vitest';
import { evaluate, evaluationMarkdown, type EvalRecord, type GroundTruth } from '../src/index.js';

/** Ground truth v2 categories (spec 009 FR-027): logged-in screens, obstacles, entry points. */
const gt: GroundTruth = {
  portal_id: 'proving-ground-shop',
  screens: [
    { id: 'S01', route_template: '/sklep', guest_visible: true, actor: 'guest' },
    { id: 'S02', route_template: '/sklep/zamowienie', guest_visible: true, actor: 'guest' },
    { id: 'S03', route_template: '/sklep/konto', guest_visible: false, actor: 'shop-client' },
  ],
  forms: [],
  rules: [],
  processes: [],
  terms: [],
  redirects: [{ id: 'D01', from: '/shop/index.php?cat=:n', to: '/sklep' }],
  obstacles: [
    { id: 'LO-37', screens: ['S02'], markers: ['captcha'], expected: 'handoff' },
    { id: 'LO-10', screens: ['S01'], markers: ['div', 'bez roli'], expected: 'documented' },
    { id: 'LO-38', screens: ['S01'], markers: ['cookie'], expected: 'ignored' },
    { id: 'LO-01', screens: ['S01'], markers: ['micro-frontend'], expected: 'navigated' },
  ],
};

const rec = (
  key: string,
  kind: EvalRecord['kind'],
  content: object,
  routes: string[],
): EvalRecord => ({
  key,
  kind,
  rev: 1,
  confidence: 'observed',
  not_observable: false,
  content: content as Record<string, unknown>,
  evidence: [{ target_kind: 'state', target_id: key, routes }],
});

describe('evaluate v2 categories', () => {
  it('scores logged-in screens, obstacles by their expected handling, and entry points', () => {
    const records = [
      rec('SCR-001', 'screen', { route_templates: ['/sklep'] }, ['/sklep']),
      rec('SCR-002', 'screen', { route_templates: ['/sklep/konto'] }, ['/sklep/konto']),
      rec(
        'NFR-001',
        'requirement',
        { statement: '"Dodaj do koszyka" is a div without a role (bez roli)' },
        ['/sklep'],
      ),
      rec('BR-001', 'business_rule', { statement: 'Old links /shop/index.php land on /sklep' }, [
        '/sklep',
      ]),
    ];
    const r = evaluate({
      portal_id: gt.portal_id,
      as_of: '',
      records,
      groundTruth: gt,
      handoffs: ['/sklep/zamowienie'],
    });
    expect(r.scores.logged_in_screens).toMatchObject({ matched: 1, total: 1 });
    expect(r.scores.obstacles).toMatchObject({ matched: 4, total: 4, missing: [] });
    expect(r.scores.obstacles!.matches['LO-37']).toEqual(['handoff:/sklep/zamowienie']);
    expect(r.scores.entry_points).toMatchObject({ matched: 1, total: 1 });
    expect(evaluationMarkdown(r, gt)).toContain('| obstacles | 4 | 4 |');
  });

  it('misses a hand-off that never happened and an overlay documented as a screen', () => {
    const records = [
      rec('SCR-009', 'screen', { route_templates: ['/sklep'], title: 'Cookie banner' }, ['/sklep']),
    ];
    const r = evaluate({ portal_id: gt.portal_id, as_of: '', records, groundTruth: gt });
    expect(r.scores.obstacles!.missing).toEqual(['LO-10', 'LO-37', 'LO-38']);
    expect(r.failed).toContain('obstacles');
  });

  it('adds no v2 category for a v1 ground truth', () => {
    const v1: GroundTruth = {
      portal_id: gt.portal_id,
      screens: gt.screens.map((s) => ({
        id: s.id,
        route_template: s.route_template,
        guest_visible: s.guest_visible,
      })),
      forms: [],
      rules: [],
      processes: [],
      terms: [],
    };
    const r = evaluate({ portal_id: gt.portal_id, as_of: '', records: [], groundTruth: v1 });
    expect(Object.keys(r.scores).sort()).toEqual(
      ['constraints', 'fields', 'processes', 'rules', 'screens', 'terms'].sort(),
    );
  });
});
