// `save_test_data` (spec 032, owner answer O-M3): the persona holds the valid test values a form
// needs; when form probes name `missing_test_data`, the assistant asks the BA once per field and
// saves the answers here. Values are merged into the persona's `test_data` (comments kept),
// must be synthetic (the persona loader refuses personal data) and the file must still load.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, loadPersona } from '@pathfinder/config';
import { isSyntheticInput } from '@pathfinder/core';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { PersonaRefusal } from './personas.js';
import type { WorkspacePaths } from './workflow-data.js';

export const SaveTestDataInput = z.object({
  portal: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  persona: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  /** Field label exactly as the form shows it → a synthetic value. */
  values: z.record(z.string().min(1), z.string().max(500)),
});
export type SaveTestDataInput = z.infer<typeof SaveTestDataInput>;

export function saveTestData(
  paths: WorkspacePaths,
  input: SaveTestDataInput,
): { portal: string; persona: string; saved: string[] } {
  const file = join(paths.repoRoot, 'personas', input.portal, `${input.persona}.yaml`);
  if (!existsSync(file))
    throw new PersonaRefusal('MISSING_INPUT', `no persona "${input.persona}" for ${input.portal}`);
  const personal = Object.entries(input.values)
    .filter(([, v]) => !isSyntheticInput(v))
    .map(([label]) => `${label}: looks like personal data; use an obviously synthetic value`);
  if (personal.length > 0)
    throw new PersonaRefusal('INVALID', 'test data must be synthetic', personal);
  const before = readFileSync(file, 'utf8');
  const doc = parseDocument(before);
  for (const [label, value] of Object.entries(input.values)) doc.setIn(['test_data', label], value);
  writeFileSync(file, doc.toString());
  try {
    loadPersona(file, {
      fence: [join(paths.repoRoot, 'personas', '_mixins'), join(paths.repoRoot, 'personas', input.portal)],
    });
  } catch (error) {
    writeFileSync(file, before);
    if (error instanceof ConfigError)
      throw new PersonaRefusal('INVALID', 'the persona would not load with these values', error.problems);
    throw error;
  }
  return { portal: input.portal, persona: input.persona, saved: Object.keys(input.values) };
}
