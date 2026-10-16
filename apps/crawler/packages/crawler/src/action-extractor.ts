import {
  classifyAction,
  type ActionDescriptor,
  type ClassifyOptions,
  type RuleSet,
} from '@pathfinder/safety';
import type { SafetyClass } from '@pathfinder/core';
import { buildLocators, type RankedLocator } from './locators.js';
import type { DomClickable, FoundBy } from './clickables.js';
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

/**
 * Trace mode only: fillable controls become `fill` (type into), `select` (pick an option) or `check`
 * (tick a checkbox/radio) actions instead of plain clicks or being skipped.
 */
const TRACE_INPUT: Readonly<Record<string, TraceInput>> = {
  textbox: 'fill',
  searchbox: 'fill',
  spinbutton: 'fill',
  combobox: 'select',
  checkbox: 'check',
  radio: 'check',
};

export type TraceInput = 'fill' | 'check' | 'select';

export interface ExtractOptions {
  /** `map` (default) is unchanged; `trace` also extracts fillable controls as input actions. */
  mode?: 'map' | 'trace';
}

export const MAX_ACTIONS_PER_STATE = 200;

export interface CandidateAction {
  role: string;
  name: string | null;
  /** Trace mode only: the kind of input this control takes; absent for clicks. */
  input?: TraceInput;
  /** Index among elements with the same role and name in document order; disambiguates repeats. */
  nth: number;
  href?: string;
  /** Ancestor chain like `main`, `form "Logowanie"`. */
  ancestors: string[];
  descriptor: ActionDescriptor;
  /** Role-less clickables only (spec 015 R1): the click signals that found the element. */
  found_by?: FoundBy[];
  /** Role-less clickables only: element tag and DOM path (tag and child index) for the locator. */
  tag?: string;
  path?: string;
  /** Frame path of the document it lives in; absent for the top document (spec 015 R3). */
  frame?: string;
}

export interface ClassifiedAction extends CandidateAction {
  safetyClass: SafetyClass;
  rules: string[];
  reasons: string[];
}

const LINE = /^(\s*)- ([a-z][a-z0-9-]*)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]*\])*)(:)?(?: (.*))?$/;
const PROP = /^\s*- \/(\w+):\s*(.*)$/;

/**
 * A property value as written: the snapshot is YAML, which quotes a value that starts with `#`
 * (hash routes) or holds `: `, so `/url: "#/polisy"` means `#/polisy` (spec 014 F-08).
 */
function yamlScalar(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'"))
    return v.slice(1, -1).replaceAll("''", "'");
  return v;
}

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
  opts: ExtractOptions = {},
): CandidateAction[] {
  // Only `<form>` elements have an ARIA `form` node to join with; a `div_form` (spec 015) must not
  // change which DOM form an unnamed ARIA form is taken to be.
  forms = forms.filter((f) => f.kind !== 'div_form');
  const trace = opts.mode === 'trace';
  const out: CandidateAction[] = [];
  const stack: { depth: number; label: string; role: string; name: string | null }[] = [];
  const seen = new Map<string, number>();
  let last: CandidateAction | null = null;

  for (const line of snapshot.split(/\r?\n/)) {
    const prop = PROP.exec(line);
    if (prop) {
      if (prop[1] === 'url' && last && last.role !== 'button') {
        last.href = yamlScalar(prop[2]!);
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
    const input = trace ? TRACE_INPUT[role] : undefined;
    if (!(CLICKABLE.has(role) || input) || isSelectOption) {
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

    const descriptor: ActionDescriptor = {
      role,
      ...(name ? { name } : {}),
      ...(input ? { input } : {}),
    };
    if (formNode || inSearch) {
      // A fill/check/select sends nothing by itself, so the form's method and target belong to its
      // submit button, not to the control; a password field still raises the class.
      descriptor.form = {
        ...(dom
          ? input
            ? { hasPassword: dom.hasPassword }
            : { method: dom.method, action: dom.action, hasPassword: dom.hasPassword }
          : {}),
        purpose: inSearch || dom?.purpose === 'search' ? 'search' : 'other',
      };
    }
    const cand: CandidateAction = {
      role,
      name,
      ...(input ? { input } : {}),
      nth,
      ancestors,
      descriptor,
    };
    out.push(cand);
    last = cand;
    if (out.length >= MAX_ACTIONS_PER_STATE) break;
  }
  return out;
}

/**
 * Candidate actions for role-less clickables (spec 015 R1, LO-10), after the ARIA ones and within
 * what is left of the per-state cap. Their role is `generic`: the classifier finds no read evidence
 * in it, so only a read keyword in the name or a read form makes one `read` (FR-002). `nth` counts
 * repeats of the same name among them, as for ARIA candidates.
 */
export function clickableCandidates(
  clickables: readonly DomClickable[],
  forms: readonly DomForm[],
  room: number,
): CandidateAction[] {
  const seen = new Map<string, number>();
  return clickables.slice(0, Math.max(0, room)).map((c) => {
    const nth = seen.get(c.name ?? '') ?? 0;
    seen.set(c.name ?? '', nth + 1);
    const dom = c.form !== null ? forms.find((f) => f.name === c.form) : undefined;
    const descriptor: ActionDescriptor = {
      role: 'generic',
      tag: c.tag,
      ...(c.name ? { name: c.name } : {}),
      ...(c.form !== null
        ? {
            form: {
              ...(dom
                ? { method: dom.method, action: dom.action, hasPassword: dom.hasPassword }
                : {}),
              purpose: dom?.purpose ?? 'other',
            },
          }
        : {}),
    };
    return {
      role: 'generic',
      name: c.name,
      nth,
      ancestors: c.form !== null ? [`form "${c.form}"`] : [],
      descriptor,
      found_by: c.found_by,
      tag: c.tag,
      path: c.path,
    };
  });
}

/** Classify each candidate with the `safety` package. The class always comes from the server-side rules. */
export function classifyCandidates(
  cands: readonly CandidateAction[],
  rules: RuleSet,
  opts: ClassifyOptions = {},
): ClassifiedAction[] {
  return cands.map((c) => {
    const r = classifyAction(c.descriptor, rules, opts);
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
 * Locators of a role-less clickable (spec 015 R2): its DOM path first (tag and child index, the
 * only handle that tells one `div` from the next), then its text, then the container path. A role
 * locator would not resolve: `generic` is not a role Playwright can query by name.
 */
function clickableLocators(c: CandidateAction, path: string): RankedLocator[] {
  const out: Omit<RankedLocator, 'rank'>[] = [{ kind: 'path', value: path }];
  if (c.name) out.push({ kind: 'text', value: c.name });
  const self = c.name ? `${c.tag ?? 'generic'} ${JSON.stringify(c.name)}` : (c.tag ?? 'generic');
  const nth = c.nth > 0 ? ` >> nth=${c.nth}` : '';
  out.push({ kind: 'container', value: `${[...c.ancestors, self].join(' > ')}${nth}` });
  return out.map((l, rank) => ({ ...l, rank }));
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
    if (c.path !== undefined) return clickableLocators(c, c.path);
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
