// `save_persona` (R-30 T015, FR-005): write a persona the BA built in conversation.
// Refuses inline secrets (credentials go to the vault through the dashboard form, never through
// the model), refuses a ceiling above the portal's (a persona can only narrow), never overwrites,
// and must pass the same loader a run uses.

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import { z } from 'zod';
import {
  ConfigError,
  PersonaFile,
  findInlineSecrets,
  loadEffectiveConfig,
  portalEnvironments,
} from '@pathfinder/config';
import { maxSafetyClass, minSafetyClass, type SafetyClass } from '@pathfinder/core';
import { portalFile, type WorkspacePaths } from './workflow-data.js';

export const SavePersonaInput = z.object({
  portal: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  persona: PersonaFile.and(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/) })),
});
export type SavePersonaInput = z.infer<typeof SavePersonaInput>;

export class PersonaRefusal extends Error {
  constructor(
    readonly code:
      'MISSING_INPUT' | 'INLINE_SECRET' | 'CEILING_WIDENED' | 'PERSONA_EXISTS' | 'INVALID',
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'PersonaRefusal';
  }
}

export interface SavedPersona {
  portal: string;
  persona: string;
  file: string;
  effectiveMaxActionClass: SafetyClass;
  /** `ref:` names the BA still has to store through the credentials form. */
  credentialRefs: string[];
}

const REF = /^ref:(.+)$/;

export function savePersona(paths: WorkspacePaths, input: SavePersonaInput): SavedPersona {
  const { portal, persona } = input;
  const portalPath = portalFile(paths, portal);
  if (!existsSync(portalPath))
    throw new PersonaRefusal('MISSING_INPUT', `no portal "${portal}" is configured`, [
      'the portal: the BA adds it with "+ new portal" in the portal dropdown (spec 011)',
    ]);

  const secrets = findInlineSecrets(persona.auth);
  if (secrets.length > 0)
    throw new PersonaRefusal(
      'INLINE_SECRET',
      'credentials are never saved in a persona; use the credentials form and refer to them as ref:NAME',
      secrets,
    );

  // With several environments (spec 011) a persona may go as far as the most permissive one;
  // each run is still capped by its own environment's limit.
  const ceiling = portalEnvironments(portalPath)
    .map((e) => e.max_action_class ?? 'read')
    .reduce<SafetyClass>((a, b) => maxSafetyClass(a, b), 'read');
  const wanted = persona.max_action_class ?? 'read';
  if (minSafetyClass(ceiling, wanted) !== wanted)
    throw new PersonaRefusal(
      'CEILING_WIDENED',
      `a persona can only narrow the portal's limit: the portal allows up to "${ceiling}", the persona asked for "${wanted}"`,
    );

  const file = join(paths.repoRoot, 'personas', portal, `${persona.id}.yaml`);
  if (existsSync(file))
    throw new PersonaRefusal(
      'PERSONA_EXISTS',
      `persona "${persona.id}" already exists for ${portal}; pick another name`,
    );

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringify(persona), { flag: 'wx' });
  try {
    const fence = [
      join(paths.repoRoot, 'personas', '_mixins'),
      join(paths.repoRoot, 'personas', portal),
    ];
    // Validates the persona against the portal; any one environment will do for that.
    const effective = loadEffectiveConfig(
      portalPath,
      file,
      { fence },
      portalEnvironments(portalPath)[0]?.environment,
    );
    const auth = effective.persona.auth;
    const credentialRefs =
      auth === 'none'
        ? []
        : Object.values(auth)
            .map((v) => REF.exec(v)?.[1])
            .filter((v): v is string => v !== undefined);
    return {
      portal,
      persona: persona.id,
      file,
      // the most it can do on any environment; each run is capped by its own environment
      effectiveMaxActionClass: minSafetyClass(ceiling, effective.persona.max_action_class),
      credentialRefs,
    };
  } catch (error) {
    unlinkSync(file);
    if (error instanceof ConfigError)
      throw new PersonaRefusal('INVALID', 'the persona is not valid yet', error.problems);
    throw error;
  }
}
