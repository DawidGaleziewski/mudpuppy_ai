// The zoom of a canvas (the map's Graph, a Diagram): the steps, the floating zoom bar, and the
// pointer's zoom (R-103 (8), D-47): Ctrl / ⌘ + wheel and a trackpad or touch pinch zoom around the
// pointer; the wheel alone scrolls the box; a drag on the canvas never selects its words. Drag to
// pan waits for the designer (round 4 Q6).
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** The zoom steps (design answers Q4, round-3 Q3); Fit may go below the first. */
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5] as const;
const [MIN, MAX] = [0.1, 1.5];
/** A canvas opens no smaller than this (round-3 Q3): the words stay readable. */
export const READABLE = 0.8;
/** Below this a map is an overview: boxes keep shape and state, their words fade. */
export const OVERVIEW = 0.5;
export const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));
export const stepIn = (s: number) => STEPS.find((z) => z > s + 0.001) ?? s;
export const stepOut = (s: number) => [...STEPS].reverse().find((z) => z < s - 0.001) ?? s;
export const pct = (s: number) => `${String(Math.round(s * 100))}%`;

export interface ZoomBarProps {
  /** The id of the canvas it zooms. */
  controls: string;
  /** "Zoom the map", "Zoom the diagram". */
  label?: string;
  scale: number;
  fitted: boolean;
  zoom: (s: number) => void;
  fit: () => void;
}

/** The floating, sticky zoom bar (`.sy-graph__zoom`): −, the level (resets to 100 %), +, Fit. */
export function ZoomBar({ controls, label = 'Zoom the map', scale, fitted, zoom, fit }: ZoomBarProps) {
  const quiet = 'sy-btn sy-btn--sm sy-btn--quiet';
  return (
    <div className="sy-graph__zoom" role="toolbar" aria-label={label} aria-controls={controls}>
      <button className={quiet} type="button" aria-label="Zoom out" onClick={() => zoom(stepOut(scale))}>
        −
      </button>
      <button className={`${quiet} sy-graph__zoom-level`} type="button" aria-label={`Zoom ${pct(scale)}${scale < OVERVIEW ? ', overview' : ''}, reset to 100%`} onClick={() => zoom(1)}>
        {pct(scale)}
      </button>
      <button className={quiet} type="button" aria-label="Zoom in" onClick={() => zoom(stepIn(scale))}>
        +
      </button>
      <button className={quiet} type="button" aria-pressed={fitted} onClick={fit}>
        Fit
      </button>
    </div>
  );
}

/** A point of the canvas (at zoom 1) and where it was under the pointer. */
interface Anchor {
  x: number;
  y: number;
  from: number;
}

/** How fast a wheel or pinch zooms: a notch (100 px of delta) is about 28 %. */
const WHEEL = 1 / 400;

const interactive = (t: EventTarget | null) => t instanceof Element && t.closest('button, a, input, select, textarea, [tabindex]') !== null;

/**
 * Zoom at the pointer on a canvas whose content is scaled by `scale` inside the scrolling `box`
 * (the canvas is its first element child). `zoom(s)` sets the scale (and turns Fit off). After a
 * pointer zoom the box is scrolled so the point under the pointer stays there; after any other
 * change of the scale (the bar, the keys, Fit) `afterZoom` scrolls it as the caller wants.
 */
export function usePointerZoom(
  box: RefObject<HTMLElement | null>,
  scale: number,
  zoom: (s: number) => void,
  afterZoom: (box: HTMLElement) => void,
) {
  const anchor = useRef<Anchor | null>(null);
  const now = useRef(scale);
  // after a pointer zoom the point under the pointer stays there; after any other, `afterZoom`
  useLayoutEffect(() => {
    now.current = scale;
    const el = box.current;
    const a = anchor.current;
    anchor.current = null;
    if (!el) return;
    if (a) scrollBy(el, a.x * (scale - a.from), a.y * (scale - a.from));
    else afterZoom(el);
  }, [box, scale, afterZoom]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const at = (clientX: number, clientY: number, next: number) => {
      const canvas = el.firstElementChild?.getBoundingClientRect();
      if (!canvas) return;
      const from = now.current;
      const to = clamp(next);
      if (Math.abs(to - from) < 0.001) return;
      anchor.current = { x: (clientX - canvas.left) / from, y: (clientY - canvas.top) / from, from };
      zoom(to);
    };
    const wheel = (e: WheelEvent) => {
      // the plain wheel scrolls the box or the page (D-47); a trackpad pinch arrives with ctrlKey
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      at(e.clientX, e.clientY, now.current * Math.exp(-e.deltaY * WHEEL));
    };
    let pinch: number | null = null;
    const apart = (t: TouchList) => Math.hypot((t[0]?.clientX ?? 0) - (t[1]?.clientX ?? 0), (t[0]?.clientY ?? 0) - (t[1]?.clientY ?? 0));
    const touchStart = (e: TouchEvent) => {
      pinch = e.touches.length === 2 ? apart(e.touches) : null;
    };
    const touchMove = (e: TouchEvent) => {
      if (pinch === null || e.touches.length !== 2) return;
      e.preventDefault(); // the canvas zooms, not the page
      const d = apart(e.touches);
      const [a, b] = [e.touches[0], e.touches[1]];
      if (a && b && pinch > 0) at((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, now.current * (d / pinch));
      pinch = d;
    };
    const touchEnd = () => {
      pinch = null;
    };
    // a drag on the canvas's words or empty space never selects text (owner 2026-10-24)
    const down = (e: MouseEvent) => {
      if (e.button === 0 && !interactive(e.target)) e.preventDefault();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchstart', touchStart, { passive: true });
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('touchend', touchEnd);
    el.addEventListener('mousedown', down);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', touchEnd);
      el.removeEventListener('mousedown', down);
    };
  }, [box, zoom]);
}

function scrollBy(el: HTMLElement, x: number, y: number) {
  el.scrollLeft += x;
  el.scrollTop += y;
}
