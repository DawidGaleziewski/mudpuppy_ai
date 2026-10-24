import type { ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { Count } from '../atoms/Count.js';

export interface NavItem {
  href: string;
  label: ReactNode;
  /** A count beside the label; orange only with `needs` (a person must act). */
  count?: number;
  needs?: boolean;
  current?: boolean;
}

export interface NavGroup {
  /** The group's label (2.0: "Portal model", "Machine"); none for the first group. */
  label?: string;
  items: readonly NavItem[];
}

export interface AppShellProps {
  /** The header's pickers and search (portal, As of). */
  header?: ReactNode;
  /** Right end of the header: the assistant's status and the help button. */
  headerEnd?: ReactNode;
  nav: readonly NavGroup[];
  /** Below the nav items (the store picker, the version). */
  navFoot?: ReactNode;
  /** The assistant drawer, when open. */
  drawer?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}

/**
 * The console's frame (Salvage Yard page skeleton): skip link, header with the wordmark, the
 * portal sections as a grouped nav, and the main column on the grid ground.
 */
export function AppShell({ header, headerEnd, nav, navFoot, drawer, narrow = false, children }: AppShellProps) {
  return (
    <div className="sy-app">
      <a className="sy-skip" href="#main">
        Skip to content
      </a>
      <header className="sy-header">
        <Anchor className="sy-wordmark" href="/app/">
          <span className="sy-wordmark__paint">MUD</span>PUPPY
        </Anchor>
        {header}
        <span className="sy-header__spacer" />
        {headerEnd}
      </header>
      <div className="sy-app__body">
        <nav className="sy-nav" aria-label="Portal sections">
          {nav.map((group, gi) => (
            <NavItems key={gi} group={group} />
          ))}
          {navFoot !== undefined && <div className="sy-nav__foot">{navFoot}</div>}
        </nav>
        <main id="main" className={narrow ? 'sy-main sy-main--narrow' : 'sy-main'}>
          {children}
        </main>
        {drawer}
      </div>
    </div>
  );
}

function NavItems({ group }: { group: NavGroup }) {
  return (
    <>
      {group.label !== undefined && (
        <div className="sy-nav__group" aria-hidden="true">
          {group.label}
        </div>
      )}
      {group.items.map((item) => (
        <Anchor
          key={item.href}
          className="sy-nav__item"
          href={item.href}
          aria-current={item.current ? 'page' : undefined}
        >
          {item.label}
          {item.count !== undefined &&
            (item.needs ? (
              <Count>{item.count}</Count>
            ) : (
              <span className="sy-nav__count">{item.count}</span>
            ))}
        </Anchor>
      ))}
    </>
  );
}
