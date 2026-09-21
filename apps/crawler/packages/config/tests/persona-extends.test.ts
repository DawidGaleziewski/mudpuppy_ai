import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPersona } from '../src/index.js';
import { tmpTree } from './helpers.js';

const MIXIN = `
auth: none
max_action_class: read
consent: { decline_location: true, decline_marketing: true }
viewport: { width: 1366, height: 768 }
locale: pl-PL
scope_restrictions: { allowed_paths: ["/a/*", "/b/*"] }
`;

describe('persona extends', () => {
  it('resolves a persona with no extends', () => {
    const root = tmpTree({ 'guest.yaml': `id: guest\n${MIXIN}` });
    const p = loadPersona(join(root, 'guest.yaml'));
    expect(p).toMatchObject({
      id: 'guest',
      auth: 'none',
      locale: 'pl-PL',
      max_action_class: 'read',
    });
  });

  it('applies a mixin from personas/_mixins first and the target last', () => {
    const root = tmpTree({
      'personas/_mixins/anonymous-base.yaml': MIXIN,
      'personas/portal/guest.yaml': `id: guest\nextends: ["../_mixins/anonymous-base.yaml"]\nlocale: en-GB\nconsent: { decline_location: false }\n`,
    });
    const p = loadPersona(join(root, 'personas/portal/guest.yaml'));
    expect(p.locale).toBe('en-GB');
    expect(p.viewport).toEqual({ width: 1366, height: 768 });
    // objects merge field by field; the target overrides only what it declares
    expect(p.consent).toEqual({ decline_location: false, decline_marketing: true });
  });

  it('later extends entries override earlier ones', () => {
    const root = tmpTree({
      'a.yaml': 'locale: pl-PL\nviewport: { width: 100, height: 100 }\n',
      'b.yaml': 'locale: de-DE\n',
      'p.yaml': 'id: p\nextends: [a.yaml, b.yaml]\n',
      'q.yaml': 'id: q\nextends: [b.yaml, a.yaml]\n',
    });
    expect(loadPersona(join(root, 'p.yaml')).locale).toBe('de-DE');
    expect(loadPersona(join(root, 'q.yaml')).locale).toBe('pl-PL');
  });

  it('resolves depth-first through nested extends', () => {
    const root = tmpTree({
      'base.yaml': 'locale: pl-PL\nviewport: { width: 1, height: 1 }\n',
      'mid.yaml': 'extends: [base.yaml]\nviewport: { width: 2, height: 2 }\n',
      'top.yaml': 'id: top\nextends: [mid.yaml]\n',
    });
    const p = loadPersona(join(root, 'top.yaml'));
    expect(p.viewport).toEqual({ width: 2, height: 2 });
    expect(p.locale).toBe('pl-PL');
  });

  it('replaces arrays explicitly instead of concatenating', () => {
    const root = tmpTree({
      'base.yaml':
        'locale: x\nviewport: { width: 1, height: 1 }\nscope_restrictions: { allowed_paths: ["/a/*", "/b/*"] }\n',
      'p.yaml': 'id: p\nextends: [base.yaml]\nscope_restrictions: { allowed_paths: ["/c/*"] }\n',
    });
    expect(loadPersona(join(root, 'p.yaml')).scope_restrictions.allowed_paths).toEqual(['/c/*']);
  });

  it('defaults to no auth and the read ceiling', () => {
    const root = tmpTree({ 'p.yaml': 'id: p\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n' });
    expect(loadPersona(join(root, 'p.yaml'))).toMatchObject({
      auth: 'none',
      max_action_class: 'read',
    });
  });
});
