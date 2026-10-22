// Declared environments (spec 030 R-61, owner decision D-1 2026-10-15). Environments are free names
// the user declares per portal in YAML; each has its own users and its own database, and nothing may
// open a store for a name nobody declared (in the field a typo'd name created a stray store that crawl
// data leaked into). The only exception: eval environments, which the eval harness creates itself
// under a reserved prefix. No name has a meaning of its own: "production" is just a name.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError } from './errors.js';
import { readYaml } from './read.js';

/** Names the eval harness may use without a declaration (never a user's environment). */
export const EVAL_ENVIRONMENT = /^eval(-[a-z0-9]+)*$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Environment names one portal file declares (`environments:` keys, or the legacy `environment`). */
export function environmentsOf(raw: unknown): string[] {
  if (!isObject(raw)) return [];
  if (isObject(raw.environments)) return Object.keys(raw.environments);
  return typeof raw.environment === 'string' ? [raw.environment] : [];
}

/** Every environment any portal under `<root>/portals` declares, sorted, without repeats. */
export function declaredEnvironments(root: string): string[] {
  const dir = join(root, 'portals');
  if (!existsSync(dir)) return [];
  const names = new Set<string>();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, e.name, 'portal.yaml');
    if (!e.isDirectory() || !existsSync(file)) continue;
    try {
      environmentsOf(readYaml(file)).forEach((n) => names.add(n));
    } catch {
      // A broken portal file is reported where it is loaded; it declares nothing here.
    }
  }
  return [...names].sort();
}

/**
 * The environment a server or tool may open, or a `ConfigError` saying why not: unset (there is no
 * default), or not declared by any portal and not an eval environment.
 */
export function requireEnvironment(root: string, name: string | undefined): string {
  const declared = declaredEnvironments(root);
  const known = declared.length > 0 ? declared.join(', ') : 'none: declare one in a portal file';
  if (name === undefined || name.trim() === '')
    throw new ConfigError('MUDPUPPY_ENV', [
      `no environment chosen and there is no default; set MUDPUPPY_ENV to one of: ${known}`,
    ]);
  if (declared.includes(name) || EVAL_ENVIRONMENT.test(name)) return name;
  throw new ConfigError('MUDPUPPY_ENV', [
    `environment "${name}" is not declared by any portal (declared: ${known}); a typo would open a separate, empty store`,
  ]);
}
