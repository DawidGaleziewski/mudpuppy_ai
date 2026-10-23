// Adding a persona from a form or a confirmed Workbench card (spec 072 FR-004; designer answer
// 19/04, the `persona.add` command), and removing it again while no scan used it (its Undo).
//
// A persona signs in with a credential named in the vault, never with a value. Our personas sign
// in with a login and a password, so the credential `X` stands for the pair `X_LOGIN` and
// `X_PASSWORD` (as `REF_INSURER_KLIENT` does for klient.yaml). Test data are label → value, the
// labels as the forms show them; values must be synthetic. The persona is written by
// `savePersona`, which refuses secrets, widening, an existing name and an invalid file.

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { portalEnvironments } from '@mudpuppy/config';
import { isSyntheticInput, maxSafetyClass, type SafetyClass } from '@mudpuppy/core';
import { z } from 'zod';
import { PersonaRefusal, savePersona, type SavedPersona } from './personas.js';
import { portalFile, type WorkspacePaths } from './workflow-data.js';

/** `persona.add`'s args (the contract's `personaName`, `vaultRef`, the test-data rows). */
export const PersonaAddArgs = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{1,23}$/, 'lower case, 2–24 letters, digits or dashes'),
  about: z.string().max(140).optional(),
  credential: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/).optional(),
  test_data: z
    .array(
      z.object({
        field: z.object({ route: z.string().optional(), state: z.number().optional(), label: z.string().min(1).max(200) }),
        value: z.string().max(200),
      }),
    )
    .max(20)
    .optional(),
});
export type PersonaAddArgs = z.infer<typeof PersonaAddArgs>;

/** `persona.add`'s args checked, or what is wrong in one line (a card's refusal). */
export function personaArgs(raw: unknown): { ok: true; args: PersonaAddArgs } | { ok: false; problem: string } {
  const parsed = PersonaAddArgs.safeParse(raw);
  if (parsed.success) return { ok: true, args: parsed.data };
  return { ok: false, problem: `the persona is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
}

/** A refusal in one line, with its reasons. */
export const refusalText = (error: PersonaRefusal): string =>
  error.details.length > 0 ? `${error.message}: ${error.details.join('; ')}` : error.message;

/** The vault names a credential stands for: its login and its password. */
export const signInRefs = (credential: string) => ({ login: `${credential}_LOGIN`, password: `${credential}_PASSWORD` });

/** The most a persona of this portal may do: the portal's most permissive environment. */
function ceilingOf(paths: WorkspacePaths, portal: string): SafetyClass {
  return portalEnvironments(portalFile(paths, portal))
    .map((e) => e.max_action_class ?? 'read')
    .reduce<SafetyClass>((a, b) => maxSafetyClass(a, b), 'read');
}

export function addPersona(paths: WorkspacePaths, portal: string, raw: unknown): SavedPersona {
  const parsed = PersonaAddArgs.safeParse(raw);
  if (!parsed.success)
    throw new PersonaRefusal('INVALID', 'the persona is not valid', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const args = parsed.data;
  const values = Object.fromEntries((args.test_data ?? []).map((t) => [t.field.label, t.value]));
  const personal = Object.entries(values)
    .filter(([, v]) => !isSyntheticInput(v))
    .map(([label]) => `${label}: looks like personal data; use an obviously synthetic value`);
  if (personal.length > 0) throw new PersonaRefusal('INVALID', 'test data must be synthetic', personal);
  const refs = args.credential ? signInRefs(args.credential) : null;
  const persona = {
    id: args.name,
    // the defaults every persona of ours has (consent declined, viewport, locale); auth and the
    // ceiling below override the mixin's
    extends: ['../_mixins/anonymous-base.yaml'],
    ...(refs ? { auth: { login: `ref:${refs.login}`, password: `ref:${refs.password}` } } : { auth: 'none' as const }),
    max_action_class: ceilingOf(paths, portal),
    ...(Object.keys(values).length > 0 ? { test_data: values } : {}),
  };
  return savePersona(paths, { portal, persona }, args.about);
}

/** Undo: remove a persona no scan has used yet (a used one is part of the evidence). */
export function removePersona(
  raw: BetterSqlite3.Database,
  paths: WorkspacePaths,
  portal: string,
  name: string,
): { portal: string; persona: string } {
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(name)) throw new PersonaRefusal('INVALID', `"${name}" is not a persona name`);
  const file = join(paths.repoRoot, 'personas', portal, `${name}.yaml`);
  if (!existsSync(file)) throw new PersonaRefusal('MISSING_INPUT', `no persona "${name}" for ${portal}`);
  const used = raw.prepare(`SELECT 1 FROM runs WHERE portal_id = ? AND persona_id = ? LIMIT 1`).get(portal, name);
  if (used !== undefined)
    throw new PersonaRefusal('PERSONA_EXISTS', `a scan already used persona "${name}", so it stays (its scans cite it)`);
  unlinkSync(file);
  return { portal, persona: name };
}
