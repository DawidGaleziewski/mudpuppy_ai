import { createContext, Fragment, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';

export interface Crumb {
  label: ReactNode;
  href?: string;
}

/** Where a page was opened from, one step back (designer T-01): "← Process Oblicz składkę". */
export interface CameFrom {
  href: string;
  /** The page's kind in mono caps: Process, Screen, Rule, Change, Record, Scan … */
  kind: string;
  /** Its title as its heading said at the click. */
  title: string;
  /** The app's way back (history back when that is the previous entry). */
  onBack?: () => void;
}

/**
 * What the app tells every page head (`PageHeadProvider`): the page it was opened from, given the
 * crumbs' addresses (none when a crumb already leads there: the crumb takes its address), and a
 * way to hear the head's title (the next page's "came from" names it).
 */
export interface PageHeadWiring {
  cameFrom: (crumbs: readonly string[]) => { back: CameFrom | null; crumb?: { index: number; href: string } };
  title: (text: string) => void;
}

const none: PageHeadWiring = { cameFrom: () => ({ back: null }), title: () => undefined };
const Wiring = createContext<PageHeadWiring>(none);

/** The app's navigation state for every `PageHead`; the design system itself stays router-free. */
export function PageHeadProvider({ value, children }: { value: PageHeadWiring; children: ReactNode }) {
  return <Wiring.Provider value={value}>{children}</Wiring.Provider>;
}

export interface PageHeadProps {
  /** The one `h1` of the page. Short; long names take the normal case on their own. */
  title: ReactNode;
  crumbs?: readonly Crumb[];
  /** One line under the title: counts first ("22 screens · 4 processes · scanned 23 Oct"). `null`: not here yet (a skeleton line of the same height, FE-V45). */
  meta?: ReactNode;
  /** The page's actions (at most one primary button; a `Pager` first). */
  actions?: ReactNode;
}

/** "← {Kind} {title}" above the crumbs, back to the exact address left (designer T-01, D-65). */
function BackLink({ back }: { back: CameFrom }) {
  return (
    <Anchor
      className="sy-backlink"
      href={back.href}
      title={`${back.kind} ${back.title}`}
      onClick={(e) => {
        if (!back.onBack || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        back.onBack();
      }}>
      <span aria-hidden="true">←</span>
      <span className="sy-sr-only">Back to</span> <span className="sy-backlink__kind">{back.kind}</span> <span className="sy-backlink__title">{back.title}</span>
    </Anchor>
  );
}

/** The head of a page: the came-from link, crumbs, the title, its meta line, its actions. */
export function PageHead({ title, crumbs, meta, actions }: PageHeadProps) {
  const wiring = useContext(Wiring);
  const h1 = useRef<HTMLHeadingElement>(null);
  const { title: hear } = wiring;
  useLayoutEffect(() => hear(h1.current?.textContent ?? ''));
  const { back, crumb } = wiring.cameFrom((crumbs ?? []).map((c) => c.href ?? ''));
  return (
    <div className="sy-pagehead">
      {back && <BackLink back={back} />}
      {crumbs && crumbs.length > 0 && (
        <nav className="sy-crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && ' / '}
              {/* rel=up: a crumb goes up the section tree; the app returns it to the list as it was left */}
              {c.href ? (
                <Anchor href={crumb?.index === i ? crumb.href : c.href} rel="up">
                  {c.label}
                </Anchor>
              ) : (
                c.label
              )}
            </Fragment>
          ))}
        </nav>
      )}
      <div className="sy-pagehead__row">
        <h1 className="sy-h1" ref={h1}>
          {title}
        </h1>
        {actions}
      </div>
      {meta === null && (
        // the meta line's own height (its text's line box), a grey line in it until the data comes
        <p className="sy-meta" aria-hidden="true">
          <span className="sy-skel__line u-inline-block" />
          {' '}
        </p>
      )}
      {meta !== undefined && meta !== null && <p className="sy-meta">{meta}</p>}
    </div>
  );
}
