import { useLayoutEffect, useState, type RefObject } from 'react';

/** A time axis tick, placed in percent of its axis. */
export interface AxisTick {
  left: number;
  label: string;
}

/**
 * Thin a time axis to ticks at least `min` px apart (designer Q5c): the first and the last always
 * stay; a middle tick closer than `min` to the kept one before it goes (1.5 × `min` next to an
 * end, whose label is longer and anchored at the edge), and so does the last middle tick when it
 * crowds the end. Without a width yet (first render), every tick stays.
 */
export function thinTicks<T extends { left: number }>(ticks: readonly T[], widthPx: number, min = 64): T[] {
  const first = ticks.at(0);
  const last = ticks.at(-1);
  if (ticks.length < 3 || widthPx <= 0 || !first || !last) return [...ticks];
  const px = (a: T, b: T) => ((b.left - a.left) * widthPx) / 100;
  // the two ends are anchored at the edges and longer (they carry seconds): a neighbour of an end
  // keeps half as much room again
  const endRoom = min * 1.5;
  const kept: T[] = [];
  let prev = first;
  for (const t of ticks.slice(1, -1)) {
    if (px(prev, t) >= (prev === first ? endRoom : min)) {
      kept.push(t);
      prev = t;
    }
  }
  if (kept.length && px(prev, last) < endRoom) kept.pop();
  return [first, ...kept, last];
}

/** The element's width in px, kept current as it resizes (0 until measured, or without ResizeObserver). */
export function useBoxWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
