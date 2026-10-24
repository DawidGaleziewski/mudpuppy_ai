import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { Count } from '../atoms/Count.js';

export interface NavItem {
  href: string;
  label: ReactNode;
  /** A count beside the label; orange only with `needs` (a person must act). */
  count?: number;
  needs?: boolean;
  current?: boolean;
  /**
   * Not open here (designer T-12: a portal's section on All portals): shown in place, focusable,
   * no link, described by its group's `note`; pressing it does nothing.
   */
  disabled?: boolean;
}

export interface NavGroup {
  /** The group's label (2.0: "Portal model", "Machine"); none for the first group. */
  label?: string;
  /** Why its disabled items are not open ("Pick a portal to open these."), under the label. */
  note?: string;
  items: readonly NavItem[];
}

export interface AppShellProps {
  /** The header's pickers and search (portal, As of). */
  header?: ReactNode;
  /** Right end of the header: the assistant's status and the help button. */
  headerEnd?: ReactNode;
  nav: readonly NavGroup[];
  /** The assistant drawer, when open. */
  drawer?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}

/**
 * `--sy-header-h` follows the header's measured height (designer T-11; the CSS's 65 / 121 px are
 * fallbacks), so the sticky drawer and the graph's zoom bar sit right under it at any width.
 */
function useHeaderHeight() {
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = header.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const watch = new ResizeObserver(() => root.style.setProperty('--sy-header-h', `${String(Math.round(el.getBoundingClientRect().height))}px`));
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty('--sy-header-h');
    };
  }, []);
  return header;
}

/**
 * The console's frame (Salvage Yard page skeleton): skip link, header with the wordmark, the
 * portal sections as a grouped nav, and the main column on the grid ground.
 */
export function AppShell({ header, headerEnd, nav, drawer, narrow = false, children }: AppShellProps) {
  const head = useHeaderHeight();
  const why = useId();
  return (
    <div className="sy-app">
      <a className="sy-skip" href="#main">
        Skip to content
      </a>
      <header className="sy-header" ref={head}>
        <Anchor className="sy-wordmark" href="/app/" data-fresh="">
          <span className="sy-wordmark__paint">MUD</span>PUPPY
        </Anchor>
        {header}
        <span className="sy-header__spacer" />
        {headerEnd}
      </header>
      <div className="sy-app__body">
        <nav className="sy-nav" aria-label="Portal sections">
          {nav.map((group, gi) => (
            <NavItems key={gi} group={group} why={why} />
          ))}
        </nav>
        <main id="main" className={narrow ? 'sy-main sy-main--narrow' : 'sy-main'}>
          {children}
        </main>
        {drawer}
      </div>
    </div>
  );
}

/** The nav's groups; every disabled item is described by the one note (the first group's that has one). */
function NavItems({ group, why }: { group: NavGroup; why: string }) {
  return (
    <>
      {group.label !== undefined && (
        <div className="sy-nav__group" aria-hidden="true">
          {group.label}
        </div>
      )}
      {group.note !== undefined && (
        <p className="sy-nav__note" id={why}>
          {group.note}
        </p>
      )}
      {group.items.map((item) =>
        item.disabled ? (
          <a key={item.href} className="sy-nav__item" role="link" tabIndex={0} aria-disabled="true" aria-describedby={why}>
            {item.label}
          </a>
        ) : (
          // data-fresh: the nav starts a fresh trail (no "came from", designer T-01)
          <Anchor key={item.href} className="sy-nav__item" href={item.href} aria-current={item.current ? 'page' : undefined} data-fresh="">
            {item.label}
            {item.count !== undefined &&
              (item.needs ? <Count>{item.count}</Count> : <span className="sy-nav__count">{item.count}</span>)}
          </Anchor>
        ),
      )}
    </>
  );
}
