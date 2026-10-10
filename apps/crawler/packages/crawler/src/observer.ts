/// <reference lib="dom" />
import type { Frame, Page } from 'playwright';
import { MAX_ACTIONS_PER_STATE } from './action-extractor.js';
import { readClickables, selectClickables, type ClickableSelection } from './clickables.js';
import { extractForms, type DomForm } from './forms.js';
import { frameLabel, walkFrames, withFrameSnapshots, type ObservedFrame } from './frames.js';
import { evalInPage } from './in-page.js';

export { extractForms, type DomForm, type DomFormField } from './forms.js';

/**
 * ARIA snapshot of the whole page. Screenshots and element boxes of new states are taken by
 * `captureVisuals` (capture.ts) since spec 008; they are not masked (constitution 2.0.0).
 */
export function captureAria(page: Page | Frame): Promise<string> {
  return page.locator(PAGE_ROOT).first().ariaSnapshot();
}

/**
 * The element a page's snapshot starts from: `<body>`, or `<frameset>` on a frames page, which
 * has no body at all (legacy portals, spec 009 LO-04; a plain `body` locator waited forever).
 */
export const PAGE_ROOT = 'body, frameset';

export interface DomTestId {
  testId: string;
  role: string;
  /** Approximate accessible name (aria-label, else visible text), whitespace-collapsed. */
  name: string;
  /** Text of an associated <label>, for form controls. */
  label: string;
  /** Frame path of the document it lives in; absent for the top document (spec 015 R3). */
  frame?: string;
}

/** Elements exposing `data-testid`, with the role and name needed to join them to ARIA candidates. */
export function extractTestIds(page: Page | Frame): Promise<DomTestId[]> {
  return evalInPage(page, () => {
    const IMPLICIT: Record<string, string> = {
      a: 'link',
      button: 'button',
      select: 'combobox',
      textarea: 'textbox',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
    };
    const INPUT: Record<string, string> = {
      checkbox: 'checkbox',
      radio: 'radio',
      search: 'searchbox',
      button: 'button',
      submit: 'button',
      range: 'slider',
      number: 'spinbutton',
    };
    const collapse = (s: string | null | undefined): string =>
      (s ?? '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('[data-testid]')].slice(0, 500).map((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type;
      const role =
        el.getAttribute('role') ??
        (tag === 'input' ? (INPUT[type] ?? 'textbox') : (IMPLICIT[tag] ?? 'generic'));
      const labelEl = (el as HTMLInputElement).labels?.[0];
      const label = collapse(labelEl?.textContent);
      const name =
        collapse(el.getAttribute('aria-label')) ||
        label ||
        collapse(el.textContent) ||
        collapse(el.getAttribute('title')) ||
        collapse(el.getAttribute('placeholder'));
      return {
        testId: el.getAttribute('data-testid') ?? '',
        role,
        name: name.slice(0, 200),
        label: label.slice(0, 200),
      };
    });
  });
}

/** One document's snapshot: the page itself (`frame` "") or a read frame (spec 015 R3). */
export interface DocumentPart {
  frame: string;
  /** Label of its block in the page snapshot (`frameLabel`); "" for the top document. */
  label: string;
  snapshot: string;
}

export interface PageObservation {
  url: string;
  title: string;
  /** The page snapshot: the top document plus each read frame's block; fingerprinted and stored. */
  ariaSnapshot: string;
  /** Per-document snapshots, for action extraction (nth counts per document). */
  parts: DocumentPart[];
  /** Forms, test ids and clickables of every read document; those in a frame carry `frame`. */
  forms: DomForm[];
  testIds: DomTestId[];
  /** Role-less clickables (spec 015 R1, LO-10); not part of the snapshot or the fingerprint. */
  clickables: ClickableSelection;
  /** Every frame of the page, read or not, and those beyond the frame depth (counted). */
  frames: (ObservedFrame & { failed?: true })[];
  framesSkipped: number;
}

export interface ObserveOptions {
  /** Deepest frame level read (portal `scope.frame_depth`); default 3. */
  frameDepth?: number;
  /** Whether a cross-origin frame's URL is in the portal's scope; default: never. */
  frameInScope?: (url: string) => boolean;
}

interface DocumentView {
  snapshot: string;
  forms: DomForm[];
  testIds: DomTestId[];
  clickables: ClickableSelection;
}

async function observeDocument(target: Page | Frame, frame: string): Promise<DocumentView> {
  const [snapshot, forms, testIds, raw] = await Promise.all([
    captureAria(target),
    extractForms(target),
    extractTestIds(target),
    readClickables(target),
  ]);
  const sel = selectClickables(raw, MAX_ACTIONS_PER_STATE);
  if (frame === '') return { snapshot, forms, testIds, clickables: sel };
  return {
    snapshot,
    forms: forms.map((f) => ({ ...f, frame })),
    testIds: testIds.map((t) => ({ ...t, frame })),
    clickables: { ...sel, issued: sel.issued.map((c) => ({ ...c, frame })) },
  };
}

/**
 * Observe the page and, since spec 015, its frames: a wrapper iframe around a legacy app (LO-02)
 * and a frameset (LO-04) are one screen with their frames' content. A frame that fails to read (it
 * navigated or detached meanwhile) is recorded as `failed`, and the page is still observed.
 */
export async function observePage(page: Page, opts: ObserveOptions = {}): Promise<PageObservation> {
  const [top, title] = await Promise.all([observeDocument(page, ''), page.title()]);
  const walk = await walkFrames(page, {
    maxDepth: opts.frameDepth ?? 3,
    inScope: opts.frameInScope ?? (() => false),
  });
  const views: (DocumentView & { part: DocumentPart })[] = [
    { ...top, part: { frame: '', label: '', snapshot: top.snapshot } },
  ];
  const frames: PageObservation['frames'] = [];
  for (const { frame, ...f } of walk.frames) {
    if (!f.observed) {
      frames.push(f);
      continue;
    }
    try {
      const view = await observeDocument(frame, f.path);
      views.push({
        ...view,
        part: { frame: f.path, label: frameLabel(f), snapshot: view.snapshot },
      });
      frames.push(f);
    } catch {
      frames.push({ ...f, observed: false, failed: true });
    }
  }
  const parts = views.map((v) => v.part);
  return {
    url: page.url(),
    title,
    ariaSnapshot: withFrameSnapshots(top.snapshot, parts.slice(1)),
    parts,
    forms: views.flatMap((v) => v.forms),
    testIds: views.flatMap((v) => v.testIds),
    clickables: {
      issued: views.flatMap((v) => v.clickables.issued),
      found: views.reduce((n, v) => n + v.clickables.found, 0),
      capped: views.reduce((n, v) => n + v.clickables.capped, 0),
    },
    frames,
    framesSkipped: walk.skipped,
  };
}
