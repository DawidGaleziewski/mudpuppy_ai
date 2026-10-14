import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadPersona } from '../src/index.js';
import { tmpTree } from './helpers.js';

const MIXIN = `
auth: none
max_action_class: read
consent: { decline_location: true, decline_marketing: true }
viewport: { width: 1366, height: 768 }
locale: pl-PL
scope_restrictions: { urls: { allowed: ["/a/*", "/b/*"] } }
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

  it('attributes are free-form and merge per key; nested objects are refused (spec 024 US1)', () => {
    const root = tmpTree({
      'personas/_mixins/premium.yaml': `${MIXIN}attributes: { tariff: premium, features: [export] }\n`,
      'personas/portal/anna.yaml': `id: anna\nextends: ["../_mixins/premium.yaml"]\nattributes: { contract: B2B, seats: 3 }\n`,
      'personas/portal/bad.yaml': `id: bad\n${MIXIN}attributes: { nested: { a: 1 } }\n`,
    });
    expect(loadPersona(join(root, 'personas/portal/anna.yaml')).attributes).toEqual({
      tariff: 'premium',
      features: ['export'],
      contract: 'B2B',
      seats: 3,
    });
    expect(() => loadPersona(join(root, 'personas/portal/bad.yaml'))).toThrow(ConfigError);
    const guest = tmpTree({ 'guest.yaml': `id: guest\n${MIXIN}` });
    expect(loadPersona(join(guest, 'guest.yaml')).attributes).toEqual({});
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
        'locale: x\nviewport: { width: 1, height: 1 }\nscope_restrictions: { urls: { allowed: ["/a/*", "/b/*"] } }\n',
      'p.yaml':
        'id: p\nextends: [base.yaml]\nscope_restrictions: { urls: { allowed: ["/c/*"] } }\n',
    });
    expect(loadPersona(join(root, 'p.yaml')).scope_restrictions.urls?.allowed).toEqual(['/c/*']);
  });

  it('defaults to no auth and the read ceiling', () => {
    const root = tmpTree({ 'p.yaml': 'id: p\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n' });
    expect(loadPersona(join(root, 'p.yaml'))).toMatchObject({
      auth: 'none',
      max_action_class: 'read',
    });
  });
});

describe('persona fence (spec 002 FR-024, FR-025)', () => {
  const fenced = (root: string, portal: string) => ({
    fence: [join(root, 'personas/_mixins'), join(root, `personas/${portal}`)],
  });
  const tree = () =>
    tmpTree({
      'personas/_mixins/anonymous-base.yaml': MIXIN,
      'personas/liveinsurer/_mixins/pl.yaml': 'locale: pl-PL\n',
      'personas/marketsite/guest.yaml': `id: guest\n${MIXIN}`,
      'personas/liveinsurer/ok.yaml':
        'id: ok\nextends: ["../_mixins/anonymous-base.yaml", "_mixins/pl.yaml"]\n',
      'personas/liveinsurer/cross.yaml': 'id: cross\nextends: ["../marketsite/guest.yaml"]\n',
      'personas/liveinsurer/escape.yaml': 'id: escape\nextends: ["../../outside.yaml"]\n',
      'outside.yaml': MIXIN,
    });

  it('allows shared mixins and the portal own mixins', () => {
    const root = tree();
    const p = loadPersona(join(root, 'personas/liveinsurer/ok.yaml'), fenced(root, 'liveinsurer'));
    expect(p).toMatchObject({ id: 'ok', locale: 'pl-PL', auth: 'none' });
  });

  it('refuses extending another portal, naming both files', () => {
    const root = tree();
    let err: ConfigError | undefined;
    try {
      loadPersona(join(root, 'personas/liveinsurer/cross.yaml'), fenced(root, 'liveinsurer'));
    } catch (e) {
      err = e as ConfigError;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect(err!.file).toBe(join(root, 'personas/liveinsurer/cross.yaml'));
    expect(err!.message).toContain('extends "../marketsite/guest.yaml"');
    expect(err!.message).toContain(join(root, 'personas/marketsite/guest.yaml'));
    expect(err!.message).toContain('leaves the allowed folders');
  });

  it('refuses a .. path out of both roots and a symlink pointing outside', () => {
    const root = tree();
    expect(() =>
      loadPersona(join(root, 'personas/liveinsurer/escape.yaml'), fenced(root, 'liveinsurer')),
    ).toThrow(/leaves the allowed folders/);
    symlinkSync(join(root, 'outside.yaml'), join(root, 'personas/liveinsurer/_mixins/link.yaml'));
    writeFileSync(
      join(root, 'personas/liveinsurer/sym.yaml'),
      'id: sym\nextends: ["_mixins/link.yaml"]\n',
    );
    expect(() => loadPersona(join(root, 'personas/liveinsurer/sym.yaml'), fenced(root, 'liveinsurer'))).toThrow(
      /leaves the allowed folders/,
    );
  });

  it('checks nested extends too', () => {
    const root = tree();
    writeFileSync(
      join(root, 'personas/liveinsurer/_mixins/bad.yaml'),
      'extends: ["../../marketsite/guest.yaml"]\n',
    );
    writeFileSync(
      join(root, 'personas/liveinsurer/nested.yaml'),
      'id: nested\nextends: ["_mixins/bad.yaml"]\n',
    );
    expect(() =>
      loadPersona(join(root, 'personas/liveinsurer/nested.yaml'), fenced(root, 'liveinsurer')),
    ).toThrow(/leaves the allowed folders/);
  });
});
