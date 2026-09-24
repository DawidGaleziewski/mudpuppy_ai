import type { SafetyClass } from '@pathfinder/core';

/** What the server extracted about a control before deciding whether it may be executed. */
export interface ActionDescriptor {
  role: string;
  /** Accessible name. */
  name?: string;
  /** Visible text when it differs from the accessible name. */
  text?: string;
  /** Link target, absolute or relative to the current page. */
  href?: string;
  /** HTTP method the action would trigger, when known. */
  method?: string;
  form?: {
    method?: string;
    /** Target URL of the enclosing form. */
    action?: string;
    purpose?: 'search' | 'filter' | 'sort' | 'paginate' | 'other';
    hasPassword?: boolean;
  };
  attributes?: Record<string, string>;
  /** A class supplied by a persona or agent. It can only raise the derived class, never lower it. */
  claimedClass?: SafetyClass;
}

export interface Classification {
  safetyClass: SafetyClass;
  /** Every rule that matched (built-in denylist rule ids first-class); empty for plain read actions. */
  rules: string[];
  reasons: string[];
}

export type RefusalStatus =
  | 'skipped_unsafe'
  | 'out_of_scope'
  | 'denylisted'
  | 'robots_disallowed'
  | 'budget_reached'
  | 'unreachable';

export interface Refusal {
  status: RefusalStatus;
  /** The rule or cap that caused the refusal (denylist id, `path:` glob, `scope:domain`, `budget:max_steps`...). */
  rule: string;
  reason: string;
  /** The `robots_policies` row behind a `robots_disallowed` refusal. */
  policyId?: string;
}

export type Decision = { allowed: true } | ({ allowed: false } & Refusal);
