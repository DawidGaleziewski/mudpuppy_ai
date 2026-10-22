// The persona a Workbench Start card scans as (spec 044 FR-002, FR-004): the person's choice is
// checked here, and without one the portal's `guest`, else its first persona by name. The newest
// scan's persona comes first; `workbench-commands` takes it from the store.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspacePaths } from './workflow-data.js';

/** A persona id as the scope check accepts it. */
export const isPersonaName = (name: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name);

/** The portal's persona files (`personas/<portal>/*.yaml`, top level), sorted by name. */
function personaFiles(paths: WorkspacePaths, portal: string): string[] {
  const dir = join(paths.repoRoot, 'personas', portal);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.slice(0, -'.yaml'.length))
    .sort();
}

/** `guest` when the portal has it, else its first persona by name; none without persona files. */
export function fallbackPersona(paths: WorkspacePaths, portal: string): string | undefined {
  const files = personaFiles(paths, portal);
  return files.includes('guest') ? 'guest' : files[0];
}
