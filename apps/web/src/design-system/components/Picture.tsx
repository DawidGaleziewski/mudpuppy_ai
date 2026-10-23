import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Anchor } from './Anchor.js';
import { Button, LinkButton } from './Button.js';
import { Segmented } from './Segmented.js';
import { Cluster, Split, Stack } from './Layout.js';
import { Text } from './Text.js';

/** One picture of a set the dialog steps through (a screen's variants). */
export interface PictureItem {
  /** The short name in the dialog's heading and its Previous / Next buttons ("r3"). */
  label: string;
  shot?: string | null | undefined;
  wire?: string | null | undefined;
}

export interface PictureProps {
  /** The screenshot's URL; the thumbnail shows it, else the wireframe. */
  shot?: string | null | undefined;
  /** The wireframe's URL. */
  wire?: string | null | undefined;
  /** The screen's title, the dialog's heading. */
  title: string;
  /** The thumbnail's text alternative; the button is named by it plus ", enlarge". Default "Picture of {title}". */
  alt?: string;
  route?: string | null;
  /** How many scans saw it, under the large picture. */
  scans?: number;
  /** The recorded page, the dialog's way on. */
  href?: string;
  /** `sm`: a 96 px thumbnail in a row or a table cell; by default it fills its box (a screen's page). */
  size?: 'sm';
  /** The set this picture belongs to (a screen's variants) and its place in it: ← / → and Previous / Next step through it. */
  set?: { items: readonly PictureItem[]; at: number };
}

type Fit = 'width' | 'page';
const FIT_KEY = 'mudpuppy.picture.fit';

// The Fit choice is a per-viewer convenience for the session (D-45); storage may be missing.
function storedFit(): Fit {
  try {
    return sessionStorage.getItem(FIT_KEY) === 'page' ? 'page' : 'width';
  } catch {
    return 'width';
  }
}

function keepFit(fit: Fit) {
  try {
    sessionStorage.setItem(FIT_KEY, fit);
  } catch {
    // nothing to keep it in: the choice lasts while the page is open
  }
}

// Layout only: the library's `.sy-thumb-btn` fills its box; a small thumbnail in a row is 96 px.
const SMALL: CSSProperties = { width: 96, flex: 'none' };

const viewOf = (p: { shot?: string | null | undefined }) => (p.shot ? 'shot' : 'wire');

function Thumb({ src, name, small, onOpen }: { src: string; name: string; small: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="sy-thumb-btn" style={small ? SMALL : undefined} aria-haspopup="dialog" onClick={onOpen}>
      <img className="sy-thumb" src={src} alt={name} loading="lazy" />
      <span className="sy-thumb-btn__hint" aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" focusable="false">
          <path d="M7 1h4v4M11 1L7 5M5 11H1V7M1 11l4-4" />
        </svg>
        <span className="sy-thumb-btn__word">Enlarge</span>
      </span>
      <span className="sy-sr-only">, enlarge</span>
    </button>
  );
}

interface HeadProps {
  heading: string;
  route: string | null | undefined;
  scans: number | undefined;
  view: string;
  setView: (v: string) => void;
  fit: Fit;
  setFit: (f: string) => void;
  onClose: () => void;
}

function Head({ heading, route, scans, view, setView, fit, setFit, onClose }: HeadProps) {
  return (
    <header className="sy-dialog__head">
      <Split>
        <Stack>
          <h2 className="sy-h3 sy-case-normal">{heading}</h2>
          <Cluster>
            {route && <Text route>{route}</Text>}
            {scans !== undefined && <Text small muted>{`seen in ${String(scans)} scan${scans === 1 ? '' : 's'}`}</Text>}
          </Cluster>
        </Stack>
        <Cluster>
          <Segmented
            label="Picture"
            selected={view}
            onSelect={setView}
            items={[
              { value: 'shot', label: 'Screenshot' },
              { value: 'wire', label: 'Wireframe' },
            ]}
          />
          <Segmented
            label="Fit"
            selected={fit}
            onSelect={setFit}
            items={[
              { value: 'width', label: 'Fit width' },
              { value: 'page', label: 'Whole page' },
            ]}
          />
          <Button size="md" className="sy-btn--icon sy-dialog__close" aria-label="Close (Esc)" onClick={onClose}>
            ×
          </Button>
        </Cluster>
      </Split>
    </header>
  );
}

/** The large picture, fitted; a picture that does not load says so with its address (nothing failed in the scan). */
function Figure({ src, alt, fit }: { src: string | null; alt: string; fit: Fit }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    // it scrolls a tall picture: keyboard users reach it too (axe scrollable-region-focusable)
    <figure className="sy-dialog__figure" data-fit={fit} tabIndex={0} aria-label={alt}>
      {src && failed !== src ? (
        <img src={src} alt={alt} onError={() => setFailed(src)} />
      ) : (
        <div className="sy-state">
          <p className="sy-state__title">{src ? 'Picture not available' : 'Nothing recorded for this view'}</p>
          {src && (
            <Text small muted mono>
              {src}
            </Text>
          )}
        </div>
      )}
    </figure>
  );
}

interface FootProps {
  set: PictureProps['set'];
  index: number;
  go: (to: number) => void;
  src: string | null;
  href: string | undefined;
}

function Foot({ set, index, go, src, href }: FootProps) {
  const many = set !== undefined && set.items.length > 1;
  return (
    <footer className="sy-dialog__foot">
      <Split>
        {many ? (
          <Cluster>
            <Button size="sm" disabled={index === 0} onClick={() => go(index - 1)}>
              {`← ${set.items[index - 1]?.label ?? 'Previous'}`}
            </Button>
            <Button size="sm" disabled={index === set.items.length - 1} onClick={() => go(index + 1)}>
              {`${set.items[index + 1]?.label ?? 'Next'} →`}
            </Button>
            <Text small muted>{`${String(index + 1)} of ${String(set.items.length)} variants`}</Text>
          </Cluster>
        ) : (
          <span />
        )}
        <Cluster>
          {src && (
            <Anchor className="sy-small" href={src} target="_blank" rel="noopener">
              Open full size in a new tab
            </Anchor>
          )}
          {href && <LinkButton href={href}>Open the recorded page</LinkButton>}
        </Cluster>
      </Split>
    </footer>
  );
}

/**
 * A recorded screen's picture (D-44, D-45): a thumbnail button (`.sy-thumb-btn`, the corner badge
 * says it opens larger) and a wide dialog with the large screenshot fitted to its width (it
 * scrolls inside) or the whole page, a Screenshot / Wireframe switch, the set's Previous / Next
 * (← / →) and the way to the recorded page. It never selects anything; no picture, no button.
 */
export function Picture({ shot, wire, title, alt, route, scans, href, size, set }: PictureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(set?.at ?? 0);
  const [view, setView] = useState(viewOf({ shot }));
  const [fit, setFit] = useState<Fit>(storedFit);
  const thumb = shot ?? wire;
  if (!thumb) {
    return (
      <Text small muted block>
        No picture was recorded.
      </Text>
    );
  }
  const item = set?.items[index];
  const current = item ?? { shot, wire };
  const src = (view === 'shot' ? current.shot : current.wire) ?? null;
  const heading = item ? `${title} · variant ${item.label}` : title;
  const go = (to: number) => {
    const next = set?.items[to];
    if (!next) return;
    setIndex(to);
    setView(viewOf(next));
  };
  const open = () => {
    setIndex(set?.at ?? 0);
    setView(viewOf({ shot }));
    dialog.current?.showModal();
  };
  const choose = (value: string) => {
    const f: Fit = value === 'page' ? 'page' : 'width';
    setFit(f);
    keepFit(f);
  };
  // ← / → step through the set, except inside a switch (its buttons are the person's to move between)
  const keys = (e: KeyboardEvent<HTMLDialogElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!set || !step || (e.target instanceof Element && e.target.closest('.sy-seg'))) return;
    e.preventDefault();
    go(index + step);
  };
  return (
    <>
      <Thumb src={thumb} name={alt ?? `Picture of ${title}`} small={size === 'sm'} onOpen={open} />
      <dialog ref={dialog} className="sy-dialog sy-dialog--wide" aria-label={heading} onKeyDown={keys}>
        <Head
          heading={heading}
          route={route}
          scans={scans}
          view={view}
          setView={setView}
          fit={fit}
          setFit={choose}
          onClose={() => dialog.current?.close()}
        />
        <Figure key={src} src={src} alt={`${view === 'shot' ? 'Screenshot' : 'Wireframe'} of ${heading}`} fit={fit} />
        <Foot set={set} index={index} go={go} src={src} href={href} />
      </dialog>
    </>
  );
}
