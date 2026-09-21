import type { PersonaFile } from './persona-schema.js';

const REF = /^ref:[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * `auth` credential fields must be `ref:`-prefixed names. Any other value is treated as a literal
 * secret. Problems name the field only, never echo the value.
 */
export function findInlineSecrets(auth: PersonaFile['auth']): string[] {
  if (auth === undefined || auth === 'none') return [];
  return Object.entries(auth)
    .filter(([, value]) => !REF.test(value))
    .map(
      ([field]) =>
        `auth.${field}: inline credential value; use a "ref:<NAME>" reference instead (FR-017)`,
    );
}
