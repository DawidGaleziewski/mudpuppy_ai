import { realpathSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
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
export interface LoadPersonaOptions {
  /**
   * Folders every file reached through `extends` must stay inside after resolving `..` and
   * symlinks (spec 002 FR-025): the shared `personas/_mixins` and the portal's own folder.
   */
  fence?: readonly string[];
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path); // a missing file fails later, when it is read
  }
}

function inside(file: string, root: string): boolean {
  const rel = relative(real(root), real(file));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function resolveFile(file: string, stack: string[], opts: LoadPersonaOptions, top: string): Plain {
  const abs = resolve(file);
  if (stack.includes(abs)) {
    throw new ConfigError(file, [`circular extends: ${[...stack, abs].join(' -> ')}`]);
  }
  const fragment = loadFragment(abs);
  const { extends: parents, ...own } = fragment;
  let merged: Plain = {};
  for (const parent of parents) {
    const target = resolve(dirname(abs), parent);
    if (opts.fence && !opts.fence.some((root) => inside(target, root))) {
      throw new ConfigError(top, [
        `extends "${parent}" (${real(target)}${abs === resolve(top) ? '' : `, via ${abs}`}) leaves the allowed folders (${opts.fence.join(', ')})`,
      ]);
    }
    merged = merge(merged, resolveFile(target, [...stack, abs], opts, top));
  }
  return merge(merged, own as Plain);
}

/** Resolve a persona through `extends` and validate the merged result with the full schema. */
export function loadPersona(file: string, opts: LoadPersonaOptions = {}): PersonaConfig {
  const merged = resolveFile(file, [], opts, file);
  const parsed = PersonaConfig.safeParse({
    ...merged,
    extends: loadFragment(resolve(file)).extends,
  });
  if (!parsed.success) throw new ConfigError(file, zodProblems(parsed.error));
  return parsed.data;
}
