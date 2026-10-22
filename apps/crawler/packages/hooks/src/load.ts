// Load a portal's hooks (spec 023 FR-002, edge cases): import `portals/<id>/hooks.ts` and pair
// each `hooks:` entry of the portal YAML with its exported function. A mapped function the file
// does not export, a missing file, or a file that does not load is a config error before the run
// starts. Loaded with `import()`: the servers run under tsx, so TypeScript needs no build step.

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ConfigError, type HookSpec } from '@mudpuppy/config';
import { matchUrlEntry } from '@mudpuppy/safety';
import type { Hook } from './types.js';

export interface LoadedHook {
  spec: HookSpec;
  fn: Hook;
  /** Whether the hook applies to a page (always true without `match`). */
  matches(url: string): boolean;
}

/** `hooksFile` is `portals/<id>/hooks.ts`; `specs` the portal's `hooks:` list. */
export async function loadHooks(
  hooksFile: string,
  specs: readonly HookSpec[],
): Promise<LoadedHook[]> {
  if (specs.length === 0) return [];
  if (!existsSync(hooksFile))
    throw new ConfigError(hooksFile, [
      `the portal maps ${specs.length} hook(s) but this file does not exist`,
    ]);
  let module: Record<string, unknown>;
  try {
    // A query string makes a re-import after an edit load the new file (the server stays up).
    module = (await import(`${pathToFileURL(hooksFile).href}?t=${String(Date.now())}`)) as Record<
      string,
      unknown
    >;
  } catch (err) {
    throw new ConfigError(hooksFile, [`the hooks file does not load: ${(err as Error).message}`]);
  }
  const problems = specs
    .filter((s) => typeof module[s.fn] !== 'function')
    .map(
      (s) => `hooks: ${s.point} maps "${s.fn}", which ${hooksFile} does not export as a function`,
    );
  if (problems.length > 0) throw new ConfigError(hooksFile, problems);
  return specs.map((spec) => ({
    spec,
    fn: module[spec.fn] as Hook,
    matches: (url) => spec.match === undefined || matchUrlEntry(spec.match, url),
  }));
}
