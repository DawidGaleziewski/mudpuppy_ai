import { z } from 'zod';
import {
  DEFAULT_PROFILE_NAME,
  resolveProfile,
  type FingerprintProfile,
} from '@pathfinder/fingerprint';

/**
 * Fingerprint profiles in `portal.yaml` (spec 039 T111, owner answer 3 of 2026-10-20), like
 * `fixes`: `use` names the profile this portal is fingerprinted with, `profiles` defines the
 * portal's own (each `extends` a built-in or another of them, default `rows-v2`, and overrides
 * the rules it names). An unknown name or a cycle refuses the portal (`CONFIG_INVALID`).
 *
 * ```yaml
 * fingerprint:
 *   use: no-menu
 *   profiles:
 *     no-menu: { extends: rows-v2, ignore_names_in: [navigation] }
 * ```
 */
const RoleList = z
  .array(z.string().regex(/^[a-z][a-z0-9-]*$/, 'an ARIA role such as listitem'))
  .max(60);

export const FingerprintProfileSpec = z
  .object({
    extends: z.string().min(1).optional(),
    row_roles: RoleList.optional(),
    field_roles: RoleList.optional(),
    named_roles: RoleList.optional(),
    ignore_names_in: RoleList.optional(),
    cluster_threshold: z.number().gt(0).max(1).optional(),
  })
  .strict();
export type FingerprintProfileSpec = z.infer<typeof FingerprintProfileSpec>;

export const FingerprintConfig = z
  .object({
    use: z.string().min(1).default(DEFAULT_PROFILE_NAME),
    profiles: z
      .record(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'a lowercase name'), FingerprintProfileSpec)
      .default({}),
  })
  .strict()
  .superRefine((f, c) => {
    for (const name of new Set([f.use, ...Object.keys(f.profiles)]))
      try {
        resolveProfile(name, f.profiles);
      } catch (e) {
        c.addIssue({
          code: 'custom',
          path: name === f.use ? ['use'] : ['profiles', name],
          message: (e as Error).message,
        });
      }
  });
export type FingerprintConfig = z.infer<typeof FingerprintConfig>;

/**
 * The profile a portal is fingerprinted with (validated at load, so it resolves), or another of
 * its profiles or a built-in by `name` (re-fingerprint and compare, T113; throws when unknown).
 */
export function portalFingerprintProfile(
  portal: { fingerprint: FingerprintConfig },
  name: string = portal.fingerprint.use,
): FingerprintProfile {
  return resolveProfile(name, portal.fingerprint.profiles);
}
