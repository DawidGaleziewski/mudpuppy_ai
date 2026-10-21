/**
 * Fingerprint profiles (spec 039 T111, owner answer 3 of 2026-10-20): the rules of `structure.ts`
 * and `fingerprint.ts` as parameters, chosen per portal in its YAML (`fingerprint: { use,
 * profiles }`). The built-in `rows-v2` is the behaviour before profiles. A profile is identified by
 * its name and a hash of its resolved rules, so two portals' "no-menu" with other rules never
 * pass for one. Pure.
 */
import { createHash } from 'node:crypto';

export interface FingerprintRules {
  /** Roles whose repeated siblings are rows of data even when each holds only text. */
  row_roles: readonly string[];
  /** Roles of form fields: their names are what a form asks for, never repeated data. */
  field_roles: readonly string[];
  /** Roles whose accessible name is structural in the MinHash shingles (other names are content). */
  named_roles: readonly string[];
  /**
   * Container roles (`navigation`, `banner`, `contentinfo`…) whose inside counts only as roles:
   * names are left out and equal siblings collapse, so one link more in a menu is the same page.
   */
  ignore_names_in: readonly string[];
  /** Level-2 similarity at or above which two pages are one screen, until a person accepts a τ. */
  cluster_threshold: number;
}

export interface FingerprintProfile {
  name: string;
  rules: FingerprintRules;
  /** `name@<first 8 hex of sha256(rules)>`: what observations, components and model versions record. */
  id: string;
}

/** The rules every page was fingerprinted with before profiles (F-01, F-02, F-26, F-27 @039). */
export const ROWS_V2: FingerprintRules = {
  row_roles: ['listitem', 'row', 'article', 'option', 'treeitem'],
  field_roles: [
    'textbox',
    'searchbox',
    'combobox',
    'listbox',
    'checkbox',
    'radio',
    'spinbutton',
    'slider',
    'switch',
  ],
  named_roles: [
    'button',
    'textbox',
    'searchbox',
    'combobox',
    'checkbox',
    'radio',
    'switch',
    'slider',
    'spinbutton',
    'tab',
    'menuitem',
    'form',
    'search',
    'navigation',
    'region',
    'complementary',
    'group',
    'dialog',
    'alertdialog',
    'main',
    'banner',
    'contentinfo',
  ],
  ignore_names_in: [],
  cluster_threshold: 0.9,
};

export const BUILTIN_PROFILES: Readonly<Record<string, FingerprintRules>> = { 'rows-v2': ROWS_V2 };

export const DEFAULT_PROFILE_NAME = 'rows-v2';

/** Sorted lists and fixed key order, so equal rules always hash alike. */
function canonicalRules(r: FingerprintRules): string {
  const sorted = (xs: readonly string[]) => [...new Set(xs)].sort();
  return JSON.stringify({
    row_roles: sorted(r.row_roles),
    field_roles: sorted(r.field_roles),
    named_roles: sorted(r.named_roles),
    ignore_names_in: sorted(r.ignore_names_in),
    cluster_threshold: r.cluster_threshold,
  });
}

export function makeProfile(name: string, rules: FingerprintRules): FingerprintProfile {
  const hash = createHash('sha256').update(canonicalRules(rules)).digest('hex').slice(0, 8);
  return { name, rules, id: `${name}@${hash}` };
}

export const ROWS_V2_PROFILE: FingerprintProfile = makeProfile(DEFAULT_PROFILE_NAME, ROWS_V2);

/** A portal's own profile: built-in or another of its profiles to start from, then overrides. */
export interface ProfileSpec extends Partial<FingerprintRules> {
  extends?: string;
}

/**
 * Resolve profile `name` against the portal's specs and the built-ins (a portal's spec of a
 * built-in name replaces the built-in). Throws on an unknown name or an `extends` cycle.
 */
export function resolveProfile(
  name: string,
  specs: Readonly<Record<string, ProfileSpec>> = {},
): FingerprintProfile {
  const seen: string[] = [];
  const rulesOf = (n: string): FingerprintRules => {
    if (seen.includes(n)) throw new Error(`fingerprint profile cycle: ${[...seen, n].join(' → ')}`);
    seen.push(n);
    const spec = specs[n];
    if (spec === undefined) {
      const builtin = BUILTIN_PROFILES[n];
      if (builtin === undefined) throw new Error(`unknown fingerprint profile "${n}"`);
      return builtin;
    }
    const { extends: base, ...over } = spec;
    const parent = rulesOf(base ?? DEFAULT_PROFILE_NAME);
    return {
      ...parent,
      ...Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)),
    };
  };
  return makeProfile(name, rulesOf(name));
}
