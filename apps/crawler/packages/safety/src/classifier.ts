import { maxSafetyClass, type SafetyClass } from '@pathfinder/core';
import { ACTION_RULES, LINK_ROLES, READ_KEYWORDS, READ_ROLES, normalize } from './rules.js';
import type { ActionDescriptor, Classification } from './types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

function pathOf(url: string): string {
  try {
    return new URL(url, 'https://placeholder.invalid').pathname;
  } catch {
    return url;
  }
}

function fromMethod(method: string | undefined): { cls: SafetyClass; reason: string } | null {
  if (method === undefined) return null;
  const m = method.toUpperCase();
  if (SAFE_METHODS.has(m)) return null;
  return m === 'DELETE'
    ? { cls: 'destructive', reason: `HTTP ${m}` }
    : { cls: 'mutating', reason: `non-idempotent HTTP ${m}` };
}

/** Path signals only (built-in PL/EN patterns). Used for `navigate` and for hrefs / form targets. */
export function classifyUrl(url: string): Classification {
  const path = normalize(decodeURIComponentSafe(pathOf(url)));
  let cls: SafetyClass = 'read';
  const rules: string[] = [];
  const reasons: string[] = [];
  for (const rule of ACTION_RULES) {
    if (rule.paths.some((p) => p.test(path))) {
      cls = maxSafetyClass(cls, rule.safetyClass);
      rules.push(rule.id);
      reasons.push(`path matches ${rule.id}`);
    }
  }
  return { safetyClass: cls, rules, reasons };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Pure rules engine (research §4). Returns the MOST dangerous class across all signals. Read is
 * only ever the result of positive evidence; unknown controls resolve to non-read. A class claimed
 * by a persona or the agent can raise the result but never lower it.
 */
export function classifyAction(d: ActionDescriptor): Classification {
  let cls: SafetyClass = 'read';
  const rules: string[] = [];
  const reasons: string[] = [];
  const raise = (c: SafetyClass, rule: string | null, reason: string): void => {
    cls = maxSafetyClass(cls, c);
    if (rule !== null && !rules.includes(rule)) rules.push(rule);
    reasons.push(reason);
  };

  const text = normalize([d.name, d.text].filter((s): s is string => !!s).join(' '));
  for (const rule of ACTION_RULES) {
    if (rule.keywords.some((k) => k.test(text)))
      raise(rule.safetyClass, rule.id, `label matches ${rule.id}`);
  }

  for (const url of [d.href, d.form?.action]) {
    if (url === undefined) continue;
    const u = classifyUrl(url);
    for (const r of u.rules) {
      const rule = ACTION_RULES.find((x) => x.id === r)!;
      raise(rule.safetyClass, r, `target url matches ${r}`);
    }
  }

  const method = d.method ?? d.form?.method;
  const m = fromMethod(method);
  if (m) raise(m.cls, null, m.reason);
  if (d.form?.hasPassword) raise('mutating', null, 'form carries a password field');

  if (cls === 'read') {
    const positiveRead =
      (LINK_ROLES.has(d.role) && d.href !== undefined) ||
      READ_ROLES.has(d.role) ||
      READ_KEYWORDS.some((k) => k.test(text)) ||
      (d.form?.purpose !== undefined && d.form.purpose !== 'other') ||
      d.attributes?.['aria-expanded'] !== undefined ||
      d.attributes?.['aria-haspopup'] !== undefined;
    if (!positiveRead)
      raise('mutating', 'unknown_control', 'no evidence that this control is read-only');
  }

  if (d.claimedClass !== undefined)
    raise(d.claimedClass, null, `claimed class ${d.claimedClass} (can only raise)`);
  return { safetyClass: cls, rules, reasons };
}
