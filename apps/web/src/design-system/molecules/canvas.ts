// How a canvas moves (designer T-07, D-71, FE-V37; replaces D-47's wheel rule): one hook for the
// map's Graph and a Diagram. The drawing moves by transform inside a box that never scrolls, so a
// wheel that isn't the canvas's always reaches the page.
//   At rest:  the wheel goes to the page; Ctrl / ⌘ + wheel and a pinch zoom at the pointer; a drag
//             pans (and engages); Tab focus engages.
//   Engaged:  the wheel zooms smoothly at the pointer; a drag pans; + / − / 0 zoom; Shift + arrows
//             pan; F full screen; Esc, a click outside or Tab out release.
// A press and release under 4 px is a click (it selects a node); past 4 px it pans, from anywhere.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

/** The zoom steps of the buttons and keys (T-07): from where you are to the next one. */
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const;
const [MIN, MAX] = [0.1, 4];
/** A canvas opens no smaller than this (round-3 Q3): the words stay readable. */
export const READABLE = 0.8;
/** Below this a map is an overview: boxes keep shape and state, their words fade. */
export const OVERVIEW = 0.5;
/** At least this much of the drawing stays in the box, however far it is panned. */
const KEEP = 80;
/** A press that moves less than this is a click. */
const DRAG = 4;
/** How fast a wheel zooms: a notch (100 px of delta) is about 28 %. */
const WHEEL = 1 / 400;
/** The space around the drawing at Fit and on open. */
const PAD = 16;

export const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));
export const stepIn = (z: number) => STEPS.find((s) => s > z + 0.001) ?? z;
export const stepOut = (z: number) => [...STEPS].reverse().find((s) => s < z - 0.001) ?? z;
export const pct = (z: number) => `${String(Math.round(z * 100))}%`;

/** Where the drawing is: its top-left in the box, and its scale. */
export interface View {
  x: number;
  y: number;
  z: number;
}

export interface CanvasOptions {
  /** The drawing's size at 100 %. */
  width: number;
  height: number;
  /** Full screen: always engaged (nothing else to scroll). */
  always?: boolean;
  /** Where to open (full screen opens where the embedded canvas was). */
  initial?: View;
  /** What to open on when there is no `initial`: a node's box in drawing coordinates (the start page). */
  openOn?: (drawing: HTMLElement) => { x: number; y: number; w: number; h: number } | null;
  /** F while engaged, with the view now (full screen opens there). */
  onFullScreen?: (v: View) => void;
  /** The zoom it opens at when Fit would be under readable: 80 % for a map, 100 % for a diagram (T-09). */
  openZoom?: number;
}

export interface Canvas {
  view: View;
  engaged: boolean;
  panning: boolean;
  /** The zoom buttons and keys: to `z`, keeping the box's centre (or `at`, a drawing point) still. */
  zoomTo: (z: number, at?: { x: number; y: number }) => void;
  fit: () => void;
  fitted: boolean;
  /** Bring a drawing box into view (centred). */
  show: (r: { x: number; y: number; w: number; h: number }, z?: number) => void;
  /** What a button or key last did, for the live region ("Zoom 80 %"); never the wheel. */
  said: string;
  /** True right after a drag: the click that ends it must not select. */
  dragged: () => boolean;
  /** The view now (the scale React has, and the position the pointer left). */
  current: () => View;
  /** Put the drawing at `v` (back from full screen). */
  jump: (v: View) => void;
}

const inBox = (box: HTMLElement) => ({ w: box.clientWidth, h: box.clientHeight });

/** Keep at least `KEEP` px of the drawing in the box. */
function bound(v: View, box: HTMLElement, width: number, height: number): View {
  const { w, h } = inBox(box);
  const [dw, dh] = [width * v.z, height * v.z];
  const x = Math.min(w - Math.min(KEEP, dw), Math.max(Math.min(KEEP, dw) - dw, v.x));
  const y = Math.min(h - Math.min(KEEP, dh), Math.max(Math.min(KEEP, dh) - dh, v.y));
  return { x, y, z: v.z };
}

/** The scale that shows the whole drawing in the box. */
function fitScale(box: HTMLElement, width: number, height: number): number {
  const { w, h } = inBox(box);
  if (w <= 0 || width <= 0) return 1;
  const byW = (w - 2 * PAD) / width;
  const byH = h > 0 && height > 0 ? (h - 2 * PAD) / height : byW;
  return clamp(Math.min(byW, byH));
}

/** Zoom at a box point (`px`, `py`): the drawing point under it stays there. */
const zoomAround = (v: View, z: number, px: number, py: number): View => ({ x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z, z });

/** The view that opens readable (round-3 Q3, T-09): fit when that is 80 % or more, else 80 % at the start (top-left). */
function opening(box: HTMLElement, drawing: HTMLElement | null, o: CanvasOptions): { view: View; fitted: boolean } {
  const fit = fitScale(box, o.width, o.height);
  if (fit >= READABLE) {
    const z = Math.min(fit, 1);
    const { w, h } = inBox(box);
    // fitted only when it had to shrink to fit; a drawing that fits at 100 % opens at 100 %
    return { view: { x: Math.max(PAD, (w - o.width * z) / 2), y: Math.max(PAD, (h - o.height * z) / 2), z }, fitted: fit < 1 };
  }
  const z = o.openZoom ?? READABLE;
  const on = drawing && o.openOn ? o.openOn(drawing) : null;
  if (!on) return { view: { x: PAD, y: PAD, z }, fitted: false };
  const { w, h } = inBox(box);
  const x = Math.min(PAD, w / 2 - (on.x + on.w / 2) * z);
  const y = Math.min(PAD, h / 2 - (on.y + on.h / 2) * z);
  return { view: { x, y, z }, fitted: false };
}

/** Write the view to the drawing's element (not through React per pointer event). */
function paint(canvas: HTMLElement | null, v: View) {
  if (canvas) canvas.style.transform = `translate(${String(v.x)}px, ${String(v.y)}px) scale(${String(v.z)})`;
}

/** The pointer's moves on the box: pan by drag, pinch with two pointers, a short press is a click. */
function usePointers(box: RefObject<HTMLElement | null>, apply: (f: (v: View) => View) => void, engage: () => void, setPanning: (p: boolean) => void) {
  const dragged = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const down = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null;
    let moved = false;
    let pinch: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) e.preventDefault();
      engage();
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 2) {
        const [a, b] = [...down.values()];
        pinch = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
      }
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      dragged.current = false;
    };
    const onMove = (e: PointerEvent) => {
      const was = down.get(e.pointerId);
      if (!was || !start) return;
      if (down.size === 2 && pinch !== null) {
        down.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...down.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = el.getBoundingClientRect();
        const ratio = d / pinch;
        pinch = d;
        apply((v) => zoomAround(v, clamp(v.z * ratio), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top));
        return;
      }
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture?.(e.pointerId);
        setPanning(true);
      }
      const [dx, dy] = [e.clientX - was.x, e.clientY - was.y];
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      apply((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    };
    const onUp = (e: PointerEvent) => {
      down.delete(e.pointerId);
      if (down.size < 2) pinch = null;
      if (moved) dragged.current = true;
      if (down.size === 0) {
        start = null;
        setPanning(false);
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [box, apply, engage, setPanning]);
  return useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);
}

/** The wheel: zooms at the pointer while engaged or with Ctrl / ⌘ (a trackpad pinch); else the page scrolls. */
function useWheel(box: RefObject<HTMLElement | null>, engaged: RefObject<boolean>, apply: (f: (v: View) => View) => void) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!engaged.current && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      apply((v) => zoomAround(v, clamp(v.z * Math.exp(-e.deltaY * WHEEL)), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [box, engaged, apply]);
}

/** Release on a press outside, or when focus leaves the canvas. */
function useRelease(box: RefObject<HTMLElement | null>, engaged: boolean, release: () => void) {
  useEffect(() => {
    if (!engaged) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) release();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [box, engaged, release]);
}

const PAN: Record<string, readonly [number, number]> = { ArrowUp: [0, 40], ArrowDown: [0, -40], ArrowLeft: [40, 0], ArrowRight: [-40, 0] };

interface KeyActs {
  z: number;
  zoomTo: (z: number) => void;
  /** Esc: release (none while always engaged). */
  release: (() => void) | undefined;
  /** F: full screen (none: not offered). */
  full: (() => void) | undefined;
  pan: (dx: number, dy: number) => void;
}

/** The canvas's keys: + / − / 0 zoom, Esc releases, F full screen, Shift + arrows pan; true when one was used. */
function canvasKey(e: { key: string; shiftKey: boolean }, k: KeyActs): boolean {
  const to = { '+': stepIn(k.z), '=': stepIn(k.z), '-': stepOut(k.z), '0': 1 }[e.key];
  const act = (() => {
    if (to !== undefined) return () => k.zoomTo(to);
    if (e.key === 'Escape') return k.release;
    if (e.key === 'f' || e.key === 'F') return k.full;
    const pan = PAN[e.key];
    return pan && e.shiftKey ? () => k.pan(pan[0], pan[1]) : undefined;
  })();
  act?.();
  return act !== undefined;
}

/** The zoom bar's and keys' moves over `apply`: to a scale (around the centre or a drawing point), Fit, a box in view. */
function useZoomActions(box: RefObject<HTMLElement | null>, apply: (f: (v: View) => View) => void, size: { width: number; height: number }, tell: { said: (s: string) => void; fitted: (f: boolean) => void }) {
  const { width, height } = size;
  const zoomTo = useCallback(
    (z: number, at?: { x: number; y: number }) => {
      const el = box.current;
      if (!el) return;
      const { w, h } = inBox(el);
      const to = clamp(z);
      apply((v) => (at ? { x: w / 2 - at.x * to, y: h / 2 - at.y * to, z: to } : zoomAround(v, to, w / 2, h / 2)));
      tell.said(`Zoom ${pct(to)}`);
    },
    [box, apply, tell],
  );
  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const z = fitScale(el, width, height);
    const { w, h } = inBox(el);
    apply(() => ({ x: (w - width * z) / 2, y: (h - height * z) / 2, z }));
    tell.fitted(true);
    tell.said(`Zoom ${pct(z)}, fitted`);
  }, [box, apply, width, height, tell]);
  return { zoomTo, fit };
}

/**
 * A canvas's movement over the box (`.sy-graph--canvas`, `box`) and the drawing inside it
 * (`drawing`). The view lives in a ref and is painted straight onto the drawing; React hears the
 * scale (the zoom bar, the overview) and whether it is engaged or panning.
 */
export function useCanvas(o: CanvasOptions) {
  const box = useRef<HTMLElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const first = o.initial ?? { x: PAD, y: PAD, z: 1 };
  const view = useRef<View>(first);
  const [shown, setShown] = useState<View>(first);
  const [fitted, setFitted] = useState(false);
  const [engaged, setEngaged] = useState(o.always === true);
  const [panning, setPanning] = useState(false);
  const [said, setSaid] = useState('');
  const live = useRef(engaged);
  useEffect(() => {
    live.current = engaged || o.always === true;
  }, [engaged, o.always]);
  const { width, height } = o;
  const apply = useCallback(
    (f: (v: View) => View) => {
      const el = box.current;
      const next = el ? bound(f(view.current), el, width, height) : f(view.current);
      view.current = next;
      paint(drawing.current, next);
      setShown((s) => (Math.abs(s.z - next.z) < 0.0005 ? s : next));
      setFitted(false);
    },
    [width, height],
  );
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const open = o.initial ? { view: o.initial, fitted: false } : opening(el, drawing.current, o);
    view.current = open.view;
    paint(drawing.current, open.view);
    // React hears the opening in the next frame; the drawing is already where it opens
    const t = requestAnimationFrame(() => {
      setShown(open.view);
      setFitted(open.fitted);
    });
    return () => cancelAnimationFrame(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open: later the person moves it
  }, []);
  const engage = useCallback(() => setEngaged(true), []);
  const release = useCallback(() => {
    if (!o.always) setEngaged(false);
  }, [o.always]);
  const dragged = usePointers(box, apply, engage, setPanning);
  useWheel(box, live, apply);
  useRelease(box, engaged && !o.always, release);
  const tell = useMemo(() => ({ said: setSaid, fitted: setFitted }), []);
  const { zoomTo, fit } = useZoomActions(box, apply, { width, height }, tell);
  const show = useCallback((r: { x: number; y: number; w: number; h: number }, z?: number) => zoomTo(z ?? view.current.z, { x: r.x + r.w / 2, y: r.y + r.h / 2 }), [zoomTo]);
  const on = engaged || o.always === true;
  const keys = (e: { key: string; shiftKey: boolean }) =>
    canvasKey(e, {
      z: shown.z,
      zoomTo,
      release: on && !o.always ? release : undefined,
      full: on && o.onFullScreen ? () => o.onFullScreen?.(view.current) : undefined,
      pan: (dx, dy) => apply((v) => ({ ...v, x: v.x + dx, y: v.y + dy })),
    });
  const current = useCallback(() => view.current, []);
  const jump = useCallback((v: View) => apply(() => v), [apply]);
  const canvas: Canvas = { view: shown, engaged: on, panning, zoomTo, fit, fitted, show, said, dragged, current, jump };
  return { ...canvas, box, drawing, keys, engage, release };
}
