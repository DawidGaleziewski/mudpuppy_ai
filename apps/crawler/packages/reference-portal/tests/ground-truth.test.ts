import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadGroundTruth, TODAY, type ReferencePortal } from '../src/index.js';
import { controlFor, fetchText, h1, screenHtml, start, text } from './helpers.js';

/** The ground truth must describe what the portal actually serves (FR-061). */
const gt = loadGroundTruth();
let portal: ReferencePortal;

beforeAll(async () => {
  portal = await start();
});
afterAll(() => portal.close());

describe('ground truth file', () => {
  it('meets the size promised by FR-060', () => {
    const guest = gt.screens.filter((s) => s.guest_visible);
    expect(guest.length).toBeGreaterThanOrEqual(10);
    expect(gt.forms.length).toBeGreaterThanOrEqual(3);
    expect(gt.forms.flatMap((f) => f.fields).length).toBeGreaterThanOrEqual(15);
    expect(gt.rules.length).toBeGreaterThanOrEqual(10);
    expect(gt.rules.filter((r) => !r.guest_observable).length).toBeGreaterThanOrEqual(3);
    expect(new Set(gt.rules.map((r) => r.type)).size).toBeGreaterThanOrEqual(4);
    expect(gt.processes.length).toBeGreaterThanOrEqual(3);
    expect(gt.processes.some((p) => p.ends_with === 'mutation')).toBe(true);
    expect(gt.processes.some((p) => p.ends_with === 'login_wall')).toBe(true);
    expect(gt.screens.some((s) => s.reached_by === 'login')).toBe(true);
    expect(gt.today).toBe(TODAY);
  });
});

describe('ground truth ⇔ served HTML', () => {
  it.each(gt.screens.map((s) => [s.route_template, s] as const))(
    'screen %s answers with its title',
    async (_route, s) => {
      const html = await screenHtml(portal, s.route_template);
      expect(h1(html)).toBe(s.title);
      if (!s.guest_visible) expect(html).toContain('Zaloguj się, aby zobaczyć tę stronę.');
    },
  );

  it.each(gt.forms.map((f) => [f.label, f] as const))('form %s and its fields', async (_l, f) => {
    const screen = gt.screens.find((s) => s.id === f.screen)!;
    const html = await screenHtml(portal, screen.route_template);
    expect(html).toContain(`<form aria-label="${f.label}" method="${f.method}"`);
    for (const field of f.fields) {
      const c = field.constraints;
      if (field.type === 'radio') {
        expect(html, field.label).toContain(`<legend>${field.label}</legend>`);
        for (const v of c.allowed_values ?? []) {
          const ctl = controlFor(html, v);
          expect(ctl?.attrs.type, `${field.label}: ${v}`).toBe('radio');
        }
        continue;
      }
      const ctl = controlFor(html, field.label);
      expect(ctl, `${f.label}: ${field.label}`).not.toBeNull();
      if (field.type === 'select' || field.type === 'textarea') expect(ctl!.tag).toBe(field.type);
      else expect(ctl!.attrs.type, field.label).toBe(field.type);
      expect('required' in ctl!.attrs, `${field.label} required`).toBe(c.required === true);
      if (c.min !== undefined) expect(ctl!.attrs.min, field.label).toBe(String(c.min));
      if (c.max !== undefined) expect(ctl!.attrs.max, field.label).toBe(String(c.max));
      if (c.pattern !== undefined) expect(ctl!.attrs.pattern, field.label).toBe(c.pattern);
      if (c.max_length !== undefined)
        expect(ctl!.attrs.maxlength, field.label).toBe(String(c.max_length));
      if (c.allowed_values !== undefined)
        expect(ctl!.options, field.label).toEqual(c.allowed_values);
    }
  });

  it.each(gt.rules.map((r) => [r.id, r] as const))(
    'rule %s anchor label is on its screen',
    async (_id, r) => {
      const screen = gt.screens.find((s) => s.id === r.anchor.screen)!;
      expect(text(await screenHtml(portal, screen.route_template))).toContain(r.anchor.label);
    },
  );

  it('every term appears on some guest page', async () => {
    const pages = await Promise.all(
      gt.screens.filter((s) => s.guest_visible).map((s) => screenHtml(portal, s.route_template)),
    );
    const all = pages.map(text).join(' ');
    for (const t of gt.terms) expect(all, t.term).toContain(t.term);
  });

  it('every process step is a known screen and each process starts where it says', () => {
    const routes = new Set(gt.screens.map((s) => s.route_template));
    for (const p of gt.processes) {
      for (const step of p.steps) expect(routes, `${p.name}: ${step}`).toContain(step);
      expect(p.steps[0]).toBe(p.first_route);
      expect(p.steps).toContain(p.last_observable_route);
    }
  });

  it('robots.txt allows everything but /__admin/', async () => {
    const r = await fetchText(portal, '/robots.txt');
    expect(r.text).toBe('User-agent: *\nDisallow: /__admin/\n');
  });
});
