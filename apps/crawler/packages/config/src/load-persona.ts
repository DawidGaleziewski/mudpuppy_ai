import { dirname, resolve } from 'node:path';
import { ConfigError, zodProblems } from './errors.js';
import { PersonaConfig, PersonaFile } from './persona-schema.js';
import { readYaml } from './read.js';
import { findInlineSecrets } from './secrets.js';

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Field-level merge: objects merge key by key, scalars and arrays are replaced (no implicit concatenation). */
function merge(base: Plain, over: Plain): Plain {
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v;
  }
  return out;
}

/** Load one file, validate it as a persona/mixin fragment and reject inline secrets. */
function loadFragment(file: string): PersonaFile {
  const parsed = PersonaFile.safeParse(readYaml(file));
  if (!parsed.success) throw new ConfigError(file, zodProblems(parsed.error));
  const secrets = findInlineSecrets(parsed.data.auth);
  if (secrets.length > 0) throw new ConfigError(file, secrets);
  return parsed.data;
}

/**
 * Depth-first in `extends` order, then the file's own fields applied last, so later entries
 * override earlier ones. `stack` holds the files currently being resolved: hitting one again is a
 * cycle, detected before anything is merged.
 */
function resolveFile(file: string, stack: string[]): Plain {
  const abs = resolve(file);
  if (stack.includes(abs)) {
    throw new ConfigError(file, [`circular extends: ${[...stack, abs].join(' -> ')}`]);
  }
  const fragment = loadFragment(abs);
  const { extends: parents, ...own } = fragment;
  let merged: Plain = {};
  for (const parent of parents) {
    merged = merge(merged, resolveFile(resolve(dirname(abs), parent), [...stack, abs]));
  }
  return merge(merged, own as Plain);
}

/** Resolve a persona through `extends` and validate the merged result with the full schema. */
export function loadPersona(file: string): PersonaConfig {
  const merged = resolveFile(file, []);
  const parsed = PersonaConfig.safeParse({
    ...merged,
    extends: loadFragment(resolve(file)).extends,
  });
  if (!parsed.success) throw new ConfigError(file, zodProblems(parsed.error));
  return parsed.data;
}
