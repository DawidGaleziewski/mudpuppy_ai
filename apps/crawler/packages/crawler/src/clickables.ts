/// <reference lib="dom" />
import type { FoundBy } from '@pathfinder/core';
import type { Frame, Locator, Page } from 'playwright';
import { evalOnElement, evalWithHelpers } from './pw-eval.js';

export type { FoundBy };

/** One element with a click signal, as read in the page, before selection. */
export interface RawClickable {
  /** Index of the nearest ancestor that is also a raw clickable; -1 when none. */
  parent: number;
  found_by: FoundBy[];
  tag: string;
  /** `aria-label`, else `title`, else visible text, else an inner image's alt. */
  name: string | null;
  /** Visible text, whitespace-collapsed, at most 200 characters. */
  text: string;
  /** DOM path by tag and child index from the root element; never classes or ids (LO-13, LO-14). */
  path: string;
  /** Name of the enclosing `<form>` (aria-label, name or id), for the safety classifier. */
  form: string | null;
  /** Texts of the clickable-role descendants (links, buttons, …). */
  role_texts: string[];
}

/** A clickable the crawler issues as an action. */
export interface DomClickable {
  /** Frame path of the document it lives in; absent for the top document (spec 015 R3). */
  frame?: string;
  found_by: FoundBy[];
  tag: string;
  name: string | null;
  path: string;
  form: string | null;
}

export interface ClickableSelection {
  issued: DomClickable[];
  /** Raw clickables found in the document, before dedupe. */
  found: number;
  /** Kept after dedupe but over the cap. */
  capped: number;
}

/** Elements scanned per document; a huge page stops there (spec 015 plan, performance goal). */
export const MAX_SCANNED_ELEMENTS = 5000;

// ---- In-page helpers: serialised by source into the page (evalWithHelpers); no closures. ----

function pfCollapse(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function pfNative(): string {
  return 'a[href], area[href], button, input:not([type=hidden]), select, textarea, summary, label, [contenteditable=""], [contenteditable=true]';
}

function pfRoleClickable(el: Element): boolean {
  const role = el.getAttribute('role');
  if (role === null) return el.matches(pfNative());
  return [
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
    'textbox',
    'searchbox',
    'slider',
    'spinbutton',
    'listbox',
  ].includes(role);
}

/** True when the element or one of its ancestors is left to the ARIA extractor. */
function pfInsideRole(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement)
    if (pfRoleClickable(cur)) return true;
  return false;
}

/** React (`__reactProps$…`, `__reactEventHandlers$…`) or Vue (`_vei`) click-like handler props. */
function pfFramework(el: Element): boolean {
  const rec = el as unknown as Record<string, unknown>;
  const handlers = [
    'onClick',
    'onMouseDown',
    'onMouseUp',
    'onPointerDown',
    'onPointerUp',
    'onTouchStart',
  ];
  for (const k of Object.keys(rec)) {
    if (!k.startsWith('__reactProps$') && !k.startsWith('__reactEventHandlers$')) continue;
    const props = rec[k] as Record<string, unknown> | null;
    if (props && handlers.some((h) => typeof props[h] === 'function')) return true;
  }
  const vei = rec._vei as Record<string, unknown> | undefined;
  return !!vei && Object.keys(vei).some((k) => /^on(click|mousedown|pointerdown)/i.test(k));
}

function pfSignals(el: Element): FoundBy[] {
  const found: FoundBy[] = [];
  const seen = (window as unknown as Record<symbol, WeakSet<Element> | undefined>)[
    Symbol.for('pathfinder.click-signals')
  ];
  if (seen?.has(el)) found.push('listener');
  const inline = [
    'onclick',
    'onmousedown',
    'onmouseup',
    'onpointerdown',
    'onpointerup',
    'ontouchstart',
  ];
  if (inline.some((a) => el.hasAttribute(a))) found.push('inline');
  if (pfFramework(el)) found.push('framework');
  // A pointer cursor is inherited: it counts once, on the element where it starts.
  const parentCursor = el.parentElement ? getComputedStyle(el.parentElement).cursor : '';
  if (getComputedStyle(el).cursor === 'pointer' && parentCursor !== 'pointer') found.push('cursor');
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && Number(tabindex) >= 0) found.push('tabindex');
  return found;
}

function pfPath(el: Element, root: Element): string {
  const parts: string[] = [];
  for (let cur: Element = el; cur !== root && cur.parentElement; cur = cur.parentElement) {
    const idx = Array.prototype.indexOf.call(cur.parentElement.children, cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
  }
  return [root.tagName.toLowerCase(), ...parts].join(' > ');
}

function pfDescribe(el: Element, root: Element, parent: number, found: FoundBy[]): RawClickable {
  const text = pfCollapse((el as HTMLElement).innerText).slice(0, 200);
  const name =
    pfCollapse(el.getAttribute('aria-label')) ||
    pfCollapse(el.getAttribute('title')) ||
    text ||
    pfCollapse(el.querySelector('img[alt]')?.getAttribute('alt')) ||
    null;
  const f = el.closest('form');
  return {
    parent,
    found_by: found,
    tag: el.tagName.toLowerCase(),
    name,
    text,
    path: pfPath(el, root),
    form: f ? f.getAttribute('aria-label') || f.getAttribute('name') || f.id || null : null,
    role_texts: [...el.querySelectorAll(`${pfNative()}, [role]`)]
      .filter(pfRoleClickable)
      .map((d) => pfCollapse((d as HTMLElement).innerText || d.getAttribute('aria-label'))),
  };
}

/**
 * Something a user could see and aim at: an area, and text, a name, an image or icon, or a background
 * image. An empty listener container (a toast region, an overlay root) shows nothing and its click
 * only ever times out (spec 015 F-14).
 */
function pfShowsSomething(el: Element): boolean {
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  if (pfCollapse((el as HTMLElement).innerText)) return true;
  if (el.getAttribute('aria-label') || el.getAttribute('title')) return true;
  if (el.querySelector('img, svg, canvas, picture, video, i, [class*="icon" i]')) return true;
  return getComputedStyle(el).backgroundImage !== 'none';
}

function pfScan(max: number): RawClickable[] {
  const root = document.body ?? document.documentElement;
  const out: RawClickable[] = [];
  const index = new Map<Element, number>();
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length && i < max; i++) {
    const el = all[i]!;
    if (pfInsideRole(el) || el.getClientRects().length === 0) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    const found = pfSignals(el);
    if (found.length === 0 || !pfShowsSomething(el)) continue;
    let parent = -1;
    for (let p = el.parentElement; p && parent < 0; p = p.parentElement)
      parent = index.get(p) ?? -1;
    index.set(el, out.length);
    out.push(pfDescribe(el, root, parent, found));
  }
  return out;
}

/**
 * Read every element with a click signal (R1): a click listener noted by the init script
 * (`click-signals.ts`), an inline handler attribute, a framework handler prop, a pointer cursor that
 * starts at this element, or `tabindex >= 0`. Elements with a clickable role, or inside one, are left
 * to the ARIA extractor. Runs in the page's main world, where the init script's set and the
 * frameworks' expando properties are visible.
 */
export function readClickables(target: Page | Frame): Promise<RawClickable[]> {
  return evalWithHelpers(
    target,
    [
      pfCollapse,
      pfNative,
      pfRoleClickable,
      pfInsideRole,
      pfFramework,
      pfSignals,
      pfPath,
      pfDescribe,
      pfShowsSomething,
      pfScan,
    ],
    // The literal is MAX_SCANNED_ELEMENTS: the page function cannot close over module constants.
    () => pfScan(5000),
  );
}

// ---- Selection (pure). ----

const ORDER: readonly FoundBy[] = ['listener', 'inline', 'framework', 'cursor', 'tabindex'];
const DELEGATION_ONLY = new Set<FoundBy>(['listener', 'tabindex']);

/**
 * Choose which raw clickables become actions (R1 dedupe, AS1.4):
 * - a delegation container (only a listener or `tabindex`, and two or more clickables inside it,
 *   e.g. React's root or a toolbar) is not itself an action;
 * - a wrapper whose text is that of a clickable-role element inside it (a card around its link) is
 *   left to that element;
 * - a wrapper around exactly one inner clickable with the same text gives way to the inner one,
 *   which inherits its signals;
 * then the cap applies, in document order.
 */
export function selectClickables(raw: readonly RawClickable[], cap: number): ClickableSelection {
  const children = raw.map(() => [] as number[]);
  raw.forEach((c, i) => {
    if (c.parent >= 0) children[c.parent]!.push(i);
  });
  const signals = raw.map((c) => new Set(c.found_by));
  const dropped = new Set<number>();
  raw.forEach((c, i) => {
    const kids = children[i]!;
    if (c.found_by.every((s) => DELEGATION_ONLY.has(s)) && kids.length + c.role_texts.length >= 2)
      dropped.add(i);
    else if (c.text !== '' && c.role_texts.includes(c.text)) dropped.add(i);
    else if (kids.length === 1 && c.role_texts.length === 0 && raw[kids[0]!]!.text === c.text) {
      for (const s of signals[i]!) signals[kids[0]!]!.add(s);
      dropped.add(i);
    }
  });
  const kept: DomClickable[] = [];
  raw.forEach((c, i) => {
    if (dropped.has(i)) return;
    const { tag, name, path, form } = c;
    kept.push({ found_by: ORDER.filter((s) => signals[i]!.has(s)), tag, name, path, form });
  });
  return { issued: kept.slice(0, cap), found: raw.length, capped: Math.max(0, kept.length - cap) };
}

// ---- Acting on one again (R2, FR-003). ----

export type ClickableMatch =
  | { locator: Locator; matches: number; via: 'path' | 'text' }
  | { locator: null; matches: number; outcome: 'absent' | 'ambiguous' };

/**
 * Find a role-less clickable again: its DOM path when the element there still carries the recorded
 * name, else its exact text when exactly one element shows it. Never a guess: none or several
 * candidates is `absent` / `ambiguous` and nothing is clicked (FR-003).
 */
export async function locateClickable(
  target: Page | Frame,
  a: { path: string; name: string | null },
): Promise<ClickableMatch> {
  const byPath = target.locator(`css=${a.path}`);
  const atPath = await byPath.count();
  if (atPath === 1 && (a.name === null || (await carriesName(byPath, a.name))))
    return { locator: byPath, matches: 1, via: 'path' };
  if (a.name === null) return { locator: null, matches: atPath, outcome: 'absent' };
  const byText = target.getByText(a.name, { exact: true });
  const shown = await byText.count();
  if (shown === 1) return { locator: byText, matches: 1, via: 'text' };
  return { locator: null, matches: shown, outcome: shown === 0 ? 'absent' : 'ambiguous' };
}

function carriesName(locator: Locator, name: string): Promise<boolean> {
  return evalOnElement(
    locator,
    (el, n) => {
      const c = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
      const own = [el.getAttribute('aria-label'), el.getAttribute('title')].map(c);
      return own.includes(n) || c((el as HTMLElement).innerText).slice(0, 200) === n;
    },
    name,
  );
}
