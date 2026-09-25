import { classifyAction, type ActionDescriptor, type RuleSet } from '@pathfinder/safety';
import type { SafetyClass } from '@pathfinder/core';
import { buildLocators, type RankedLocator } from './locators.js';
import type { DomForm, DomTestId } from './observer.js';

/** Roles that can be clicked to do something (typing roles are not actions in v1). */
const CLICKABLE = new Set([
  'link',
  'button',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'treeitem',
  'option',
  'combobox',
]);

export const MAX_ACTIONS_PER_STATE = 200;

export interface CandidateAction {
  role: string;
  name: string | null;
  /** Index among elements with the same role and name in document order; disambiguates repeats. */
  nth: number;
  href?: string;
  /** Ancestor chain like `main`, `form "Logowanie"`. */
  ancestors: string[];
  descriptor: ActionDescriptor;
}

export interface ClassifiedAction extends CandidateAction {
  safetyClass: SafetyClass;
  rules: string[];
  reasons: string[];
}

const LINE = /^(\s*)- ([a-z][a-z0-9-]*)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]*\])*)(:)?(?: (.*))?$/;
const PROP = /^\s*- \/(\w+):\s*(.*)$/;

const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');

/**
 * Derive candidate actions from a Playwright ARIA snapshot: links (with their `/url`), buttons, menu
 * items, tabs, comboboxes, checkboxes and similar. `forms` (from the DOM) supplies each enclosing
 * form's method/action/purpose so the classifier sees form semantics. Clickable `div`s without a role
 * are not visible to the ARIA tree and are not extracted in v1.
 */
export function extractCandidates(
  snapshot: string,
  forms: readonly DomForm[] = [],
): CandidateAction[] {
  const out: CandidateAction[] = [];
  const stack: { depth: number; label: string; role: string; name: string | null }[] = [];
  const seen = new Map<string, number>();
  let last: CandidateAction | null = null;

  for (const line of snapshot.split(/\r?\n/)) {
    const prop = PROP.exec(line);
    if (prop) {
      if (prop[1] === 'url' && last && last.role !== 'button') {
        last.href = prop[2]!.trim();
        last.descriptor.href = last.href;
      }
      continue;
    }
    const m = LINE.exec(line);
    if (!m) continue;
    const depth = Math.floor(m[1]!.length / 2);
    const role = m[2]!;
    const name = m[3] !== undefined ? unescape(m[3]) : null;
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    stack.push({ depth, label: name ? `${role} "${name}"` : role, role, name });

    // A native <select>'s options sit directly under its combobox. Choosing one only sets the field
    // (its labels are already in the form schema) and they are not clickable; left in, a long list
    // (a city picker) floods the frontier and the per-state cap. Options of a custom listbox stay.
    const isSelectOption = role === 'option' && stack[stack.length - 2]?.role === 'combobox';
    if (!CLICKABLE.has(role) || isSelectOption) {
      last = null;
      continue;
    }
    const key = `${role}\u0000${name ?? ''}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);

    const ancestors = stack.slice(0, -1).map((s) => s.label);
    const formNode = [...stack]
      .slice(0, -1)
      .reverse()
      .find((s) => s.role === 'form');
    const inSearch = stack.slice(0, -1).some((s) => s.role === 'search');
    const dom = formNode
      ? (forms.find((f) => f.name && f.name === formNode.name) ??
        (forms.length === 1 ? forms[0] : undefined))
      : undefined;

    const descriptor: ActionDescriptor = { role, ...(name ? { name } : {}) };
    if (formNode || inSearch) {
      descriptor.form = {
        ...(dom ? { method: dom.method, action: dom.action, hasPassword: dom.hasPassword } : {}),
        purpose: inSearch || dom?.purpose === 'search' ? 'search' : 'other',
      };
    }
    const cand: CandidateAction = { role, name, nth, ancestors, descriptor };
    out.push(cand);
    last = cand;
    if (out.length >= MAX_ACTIONS_PER_STATE) break;
  }
  return out;
}

/** Classify each candidate with the `safety` package. The class always comes from the server-side rules. */
export function classifyCandidates(
  cands: readonly CandidateAction[],
  rules: RuleSet,
): ClassifiedAction[] {
  return cands.map((c) => {
    const r = classifyAction(c.descriptor, rules);
    return { ...c, safetyClass: r.safetyClass, rules: r.rules, reasons: r.reasons };
  });
}

const collapse = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** The `data-testid` of the element behind a candidate, when it can be identified without ambiguity. */
function testIdFor(
  c: CandidateAction,
  all: readonly CandidateAction[],
  testIds: readonly DomTestId[],
): DomTestId | undefined {
  if (c.name === null) return undefined;
  const name = collapse(c.name);
  const matches = testIds.filter((t) => t.role === c.role && collapse(t.name) === name);
  if (matches.length === 0) return undefined;
  const same = all.filter((o) => o.role === c.role && collapse(o.name) === name).length;
  if (same === matches.length) return matches[c.nth];
  return same === 1 ? matches[0] : undefined; // ambiguous repeats: better no id than a wrong one
}

/**
 * Ranked locators (FR-013) for every candidate: role+name, label/text, `data-testid` when the element
 * has one, and a container path. Order of the result matches `cands`.
 */
export function attachLocators(
  cands: readonly CandidateAction[],
  testIds: readonly DomTestId[] = [],
): RankedLocator[][] {
  return cands.map((c) => {
    const t = testIdFor(c, cands, testIds);
    return buildLocators({
      role: c.role,
      name: c.name,
      label: t?.label || null,
      testId: t?.testId || null,
      ancestors: c.ancestors,
      nth: c.nth,
    });
  });
}
