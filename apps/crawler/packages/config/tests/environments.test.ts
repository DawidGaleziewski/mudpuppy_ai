import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaredEnvironments, requireEnvironment } from '../src/environments.js';

/** A root with portal files: `{ id: yaml }`. */
function root(portals: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pf-envs-'));
  for (const [id, yaml] of Object.entries(portals)) {
    mkdirSync(join(dir, 'portals', id), { recursive: true });
    writeFileSync(join(dir, 'portals', id, 'portal.yaml'), yaml);
  }
  return dir;
}

const r = root({
  a: 'id: a\nenvironments:\n  dev: { base_url: "http://dev.a.test/" }\n  acceptance: { base_url: "http://acc.a.test/" }\n',
  b: 'id: b\nenvironment: live\nbase_url: http://b.test/\n',
  broken: 'id: [',
});

describe('declared environments (spec 030 R-61, D-1)', () => {
  it('collects the names every portal declares, free names included', () => {
    expect(declaredEnvironments(r)).toEqual(['acceptance', 'dev', 'live']);
  });

  it('has no default: an unset environment is refused, naming the declared ones', () => {
    expect(() => requireEnvironment(r, undefined)).toThrow(
      /no environment chosen and there is no default; set PATHFINDER_ENV to one of: acceptance, dev, live/,
    );
  });

  it('refuses an undeclared name (a typo would open a stray store)', () => {
    expect(() => requireEnvironment(r, 'acceptence')).toThrow(/not declared by any portal/);
  });

  it('accepts a declared name and an eval environment, with no special name', () => {
    expect(requireEnvironment(r, 'live')).toBe('live');
    expect(requireEnvironment(r, 'eval-bank')).toBe('eval-bank');
    expect(() => requireEnvironment(r, 'production')).toThrow(/not declared/);
  });
});
