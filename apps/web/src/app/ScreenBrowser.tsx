import { useCallback, useState } from 'react';
import { PictureBrowser, type BrowseItem, type BrowsePick } from '../design-system';
import { useScreenIf } from './api-screens';

/**
 * The picture dialog over a list of screens (designer T-04): the list's page holds which one is
 * shown; the shown screen's variants are read as it is shown. On close, focus returns to the row
 * picture of the screen last viewed (`data-pick`), scrolled into view.
 */
export function useScreenBrowser() {
  const [index, setIndex] = useState<number | null>(null);
  const close = useCallback((key: string | undefined) => {
    setIndex(null);
    if (!key) return;
    // after the dialog has handed focus back
    window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-pick="${CSS.escape(key)}"]`);
      row?.scrollIntoView?.({ block: 'nearest' });
      row?.focus();
    }, 0);
  }, []);
  return { index, open: setIndex, close };
}

export function ScreenBrowser({
  portal,
  items,
  label,
  index,
  onIndex,
  onClose,
  pick,
  screenOf,
}: {
  portal: string;
  items: readonly BrowseItem[];
  label: string;
  index: number | null;
  onIndex: (i: number) => void;
  onClose: (key: string | undefined) => void;
  pick?: BrowsePick;
  /** The model screen of an item whose key is a recorded state (the loose screens); default: the key is the screen. */
  screenOf?: (key: string) => string | null;
}) {
  const shown = index === null ? null : (items[index]?.key ?? null);
  const key = shown !== null && screenOf ? screenOf(shown) : shown;
  // the shown screen's own (`currentData`): never the previous screen's variants while stepping
  const variants = useScreenIf(portal, key).currentData?.variants.map((v) => ({ label: `r${String(v.ordinal)}`, shot: v.picture?.shot ?? null, wire: v.picture?.wire ?? null }));
  return (
    <PictureBrowser
      index={index}
      onIndex={onIndex}
      onClose={(last) => onClose(items[last]?.key)}
      items={items}
      label={label}
      {...(variants && { variants })}
      {...(pick && { pick })}
    />
  );
}
