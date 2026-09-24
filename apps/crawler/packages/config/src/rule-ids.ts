import type { SafetyClass } from '@pathfinder/core';

/**
 * Built-in denylist rule ids and their safety classes (spec 002 FR-012). The keywords and path
 * patterns live in `safety` (`rules.ts`); a test there keeps both lists identical. Kept here because
 * `safety` depends on `config`, and portal files are validated against these ids at load time.
 */
export const BUILTIN_RULE_CLASSES = {
  logout: 'destructive',
  delete: 'destructive',
  payment: 'external-side-effect',
  purchase: 'external-side-effect',
  contact_or_message: 'external-side-effect',
  reveal_contact: 'external-side-effect',
  submit_request: 'external-side-effect',
} as const satisfies Record<string, SafetyClass>;
export type BuiltinRuleId = keyof typeof BUILTIN_RULE_CLASSES;

/** Earlier, marketplace-specific ids, still accepted in portal files (FR-013). */
export const RULE_ALIASES = {
  bidding: 'purchase',
  buy_now: 'purchase',
  message_or_contact_seller: 'contact_or_message',
  reveal_seller_contact: 'reveal_contact',
} as const satisfies Record<string, BuiltinRuleId>;

/** Every id a portal `denylist` may list: built-in ids and their aliases. */
export const DENYLIST_RULE_IDS: readonly string[] = [
  ...Object.keys(BUILTIN_RULE_CLASSES),
  ...Object.keys(RULE_ALIASES),
];

/** The generic id an id stands for, and the alias as written when it was one. */
export function resolveRuleId(id: string): { id: string; alias?: string } {
  const generic = (RULE_ALIASES as Record<string, string>)[id];
  return generic === undefined ? { id } : { id: generic, alias: id };
}
