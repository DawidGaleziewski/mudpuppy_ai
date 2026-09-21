import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEffectiveConfig } from '../src/index.js';
import { PORTAL_YAML, tmpTree } from './helpers.js';

const persona = (cls: string) =>
  `id: p\nauth: none\nmax_action_class: ${cls}\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n`;
const sandbox = (ceiling: string) =>
  PORTAL_YAML.replace(
    'environment: production',
    `environment: sandbox\nmax_action_class: ${ceiling}`,
  );

function effective(portalYaml: string, personaYaml: string) {
  const root = tmpTree({ 'portal.yaml': portalYaml, 'persona.yaml': personaYaml });
  return loadEffectiveConfig(join(root, 'portal.yaml'), join(root, 'persona.yaml'));
}

describe('effective ceiling', () => {
  it('persona above the portal ceiling is capped to the portal', () => {
    expect(effective(sandbox('mutating'), persona('destructive')).effectiveMaxActionClass).toBe(
      'mutating',
    );
  });
  it('persona below the portal ceiling wins', () => {
    expect(effective(sandbox('destructive'), persona('read')).effectiveMaxActionClass).toBe('read');
  });
  it('production without max_action_class defaults the portal to read', () => {
    expect(effective(PORTAL_YAML, persona('external-side-effect')).effectiveMaxActionClass).toBe(
      'read',
    );
  });
  it('returns the validated portal and resolved persona', () => {
    const e = effective(PORTAL_YAML, persona('read'));
    expect(e.portal.id).toBe('marketsite');
    expect(e.persona.id).toBe('p');
  });
});
