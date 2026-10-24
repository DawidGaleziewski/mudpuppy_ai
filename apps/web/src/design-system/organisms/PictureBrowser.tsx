import { useEffect, useState, type KeyboardEvent } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { Button } from '../atoms/Button.js';
import { Check } from '../atoms/Controls.js';
import { Text } from '../atoms/Text.js';
import { Cluster, Split, Stack } from '../layout/Layout.js';
import { Menu, type MenuEntry } from '../molecules/Menu.js';
import { Segmented } from '../molecules/Segmented.js';
import { Dialog } from './Dialog.js';

/** One screen of the list the dialog browses. */
export interface BrowseItem {
  key: string;
  title: string;
  route?: string | null;
  shot?: string | null;
  wire?: string | null;
  /** The screen's page ("Open screen page"). */
  href?: string;
}

/** A variant of the current screen (the head's switch, Shift + ← / →). */
export interface BrowseVariant {
  label: string;
  shot?: string | null;
  wire?: string | null;
}

/** A list you sort (In no process): its tick and Add to process ride in the foot. */
export interface BrowsePick {
  /** "In the new process". */
  tickLabel: string;
  ticked: (key: string) => boolean;
  /** The step number it got, in tick order. */
  step: (key: string) => number | null;
  onTick: (key: string) => void;
  /** Add to process ▾ for the current screen. */
  addEntries?: (key: string) => readonly MenuEntry[];
}

export interface PictureBrowserProps {
  /** Shown while not null: the index in `items`. */
  index: number | null;
  onIndex: (index: number) => void;
  /** Esc or ×: with the index last viewed (the list returns focus to its row). */
  onClose: (last: number) => void;
  items: readonly BrowseItem[];
  /** The list's name ("in no process", "Screens in this list"). */
  label: string;
  /** The current screen's variants (when known); one or none: no switch. */
  variants?: readonly BrowseVariant[];
  pick?: BrowsePick;
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, j: 1, k: -1 };

/** Preload the neighbours' pictures, so a step shows at once. */
function usePreload(items: readonly BrowseItem[], index: number | null) {
  useEffect(() => {
    if (index === null) return;
    for (const n of [items[index - 1], items[index + 1]]) {
      const src = n?.shot ?? n?.wire;
      if (src) new Image().src = src;
    }
  }, [items, index]);
}

/** "← Previous · 5 of 12 · Next →" and the list's name; the position is announced after each step. */
function Stepper({ at, total, label, onIndex }: { at: number; total: number; label: string; onIndex: (i: number) => void }) {
  return (
    <span className="sy-dialog__stepper">
      <nav className="sy-pager" aria-label={`Screens ${label}`}>
        <Button size="sm" aria-disabled={at === 0 || undefined} aria-keyshortcuts="ArrowLeft K" onClick={() => at > 0 && onIndex(at - 1)}>
          ← Previous
        </Button>
        <span className="sy-pager__pos" aria-live="polite">{`${String(at + 1)} of ${String(total)}`}</span>
        <Button size="sm" aria-disabled={at === total - 1 || undefined} aria-keyshortcuts="ArrowRight J" onClick={() => at < total - 1 && onIndex(at + 1)}>
          Next →
        </Button>
      </nav>
      <Text small muted>
        {label}
      </Text>
    </span>
  );
}

/** The list's own actions on the shown screen: the tick with its step number, Add to process. */
function Pick({ item, pick, addOpen, setAddOpen }: { item: BrowseItem; pick: BrowsePick | undefined; addOpen: boolean; setAddOpen: (o: boolean) => void }) {
  const step = pick ? pick.step(item.key) : null;
  const entries = pick?.addEntries?.(item.key);
  return (
    <span className="sy-dialog__pick">
      {pick && <Check label={pick.tickLabel} checked={pick.ticked(item.key)} onChange={() => pick.onTick(item.key)} aria-keyshortcuts="X" />}
      {step !== null && <span className="sy-dialog__step">{`step ${String(step)}`}</span>}
      {entries && <Menu label="Add to process" button="Add to process ▾" entries={entries} align="up" open={addOpen} onOpenChange={setAddOpen} searchAfter={8} searchLabel="Find a process" />}
      {item.href && (
        <Anchor className="sy-small" href={item.href}>
          Open screen page
        </Anchor>
      )}
    </span>
  );
}

const keysLine = (pick: BrowsePick | undefined) =>
  ['← → or J K list', 'Shift + ← → variants', pick && 'X tick', pick?.addEntries && 'A add to process', 'Esc close'].filter(Boolean).join(' · ');

function Foot({ props, item, at, addOpen, setAddOpen }: { props: PictureBrowserProps; item: BrowseItem; at: number; addOpen: boolean; setAddOpen: (o: boolean) => void }) {
  return (
    <Dialog.Foot>
      <Split>
        <Stepper at={at} total={props.items.length} label={props.label} onIndex={props.onIndex} />
        <Pick item={item} pick={props.pick} addOpen={addOpen} setAddOpen={setAddOpen} />
      </Split>
      <p className="sy-dialog__keys">{keysLine(props.pick)}</p>
    </Dialog.Foot>
  );
}

interface KeyMoves {
  at: number;
  total: number;
  variants: number;
  onIndex: (i: number) => void;
  onVariant: (step: number) => void;
  onTick: (() => void) | undefined;
  onAdd: (() => void) | undefined;
}

/** ← → / J K the list, Shift + ← → the variants, X the tick, A Add to process; not inside a field, a switch or the menu. */
function browseKey(e: KeyboardEvent<HTMLDialogElement>, m: KeyMoves) {
  if (e.target instanceof HTMLInputElement || (e.target instanceof Element && e.target.closest('.sy-seg, .sy-menu'))) return;
  const act = moveFor(e.key, e.shiftKey, m);
  if (!act) return;
  e.preventDefault();
  act();
}

function moveFor(key: string, shift: boolean, m: KeyMoves): (() => void) | undefined {
  const step = STEP[key];
  if (step === undefined) return { x: m.onTick, a: m.onAdd }[key];
  if (shift) return m.variants > 1 ? () => m.onVariant(step) : undefined;
  return () => m.onIndex(Math.min(m.total - 1, Math.max(0, m.at + step)));
}

type View = 'shot' | 'wire';

/** The picture to show: the view asked for, else the other one. */
const srcOf = (p: { shot?: string | null | undefined; wire?: string | null | undefined }, view: View) =>
  (view === 'shot' ? (p.shot ?? p.wire) : (p.wire ?? p.shot)) ?? null;

interface HeadProps {
  item: BrowseItem;
  variants: readonly BrowseVariant[];
  variant: number;
  setVariant: (v: number) => void;
  view: View;
  setView: (v: View) => void;
}

/** The screen's title and route; its variants as a switch ("variant r1 of 2"); Screenshot / Wireframe; ×. */
function BrowseHead({ item, variants, variant, setVariant, view, setView }: HeadProps) {
  const many = variants.length > 1;
  return (
    <Dialog.Head>
      <Split>
        <Stack>
          <h2 className="sy-h3 sy-case-normal">{item.title}</h2>
          <Cluster>
            {item.route && <Text route>{item.route}</Text>}
            {many && <Text small muted>{`variant ${variants[variant]?.label ?? ''} of ${String(variants.length)}`}</Text>}
          </Cluster>
        </Stack>
        <Cluster>
          {many && <Segmented label="Variant" selected={String(variant)} onSelect={(v) => setVariant(Number(v))} items={variants.map((v, i) => ({ value: String(i), label: v.label }))} />}
          <Segmented
            label="Picture"
            selected={view}
            onSelect={(v) => setView(v === 'wire' ? 'wire' : 'shot')}
            items={[
              { value: 'shot', label: 'Screenshot' },
              { value: 'wire', label: 'Wireframe' },
            ]}
          />
          <Dialog.Close />
        </Cluster>
      </Split>
    </Dialog.Head>
  );
}

/**
 * The picture dialog browsing the list it was opened from (designer T-04, D-68, FE-V34): ← → (and
 * J K) step through the list; the screen's variants are a switch in the head (Shift + ← →). From a
 * list you sort, the foot carries the list's own actions: the tick (X) with its step number and
 * Add to process (A). It never changes the screen. Its size stays while stepping, so the foot
 * never jumps.
 */
export function PictureBrowser(props: PictureBrowserProps) {
  const { index, items, onIndex, onClose, variants = [], pick } = props;
  // the variant shown belongs to one screen: stepping to another starts at its r1
  const [chosen, setChosen] = useState({ at: index, v: 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<View>('shot');
  usePreload(items, index);
  const at = index ?? 0;
  const variant = chosen.at === index ? chosen.v : 0;
  const setVariant = (v: number) => setChosen({ at: index, v: Math.min(variants.length - 1, Math.max(0, v)) });
  const item = items[at];
  if (!item) return null;
  const src = srcOf(variants.length > 1 ? (variants[variant] ?? item) : item, view);
  const moves: KeyMoves = {
    at,
    total: items.length,
    variants: variants.length,
    onIndex,
    onVariant: (step) => setVariant(variant + step),
    onTick: pick && (() => pick.onTick(item.key)),
    onAdd: pick?.addEntries && (() => setAddOpen(true)),
  };
  return (
    <Dialog open={index !== null} onClose={() => onClose(at)} label={item.title} size="browse" onKeyDown={(e) => browseKey(e, moves)}>
      <BrowseHead item={item} variants={variants} variant={variant} setVariant={setVariant} view={view} setView={setView} />
      <Dialog.Figure label={`Picture of ${item.title}`}>
        {src ? (
          <img key={src} src={src} alt={`${view === 'shot' ? 'Screenshot' : 'Wireframe'} of ${item.title}`} />
        ) : (
          <div className="sy-state">
            <p className="sy-state__title">Nothing recorded for this screen</p>
          </div>
        )}
      </Dialog.Figure>
      <Foot props={props} item={item} at={at} addOpen={addOpen} setAddOpen={setAddOpen} />
    </Dialog>
  );
}
