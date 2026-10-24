import { useCallback, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { AnchorProps, DrawLink } from '../design-system';
import { currentAsOf, withAsOf } from './asOf';
import { fromHere } from './cameFrom';
import { asLeft } from './listAddress';
import { currentStore, withStore } from './store';

/** An address the app's router draws: a page under `/app/`, or a change of query or hash on this page. */
export function inApp(href: string): boolean {
  return href === '/app' || href.startsWith('/app/') || href.startsWith('?');
}

/**
 * What a link does with the page it leaves (designer T-01, T-02): a nav item, a crumb (`rel=up`)
 * or another site starts fresh; Previous / Next (`rel=prev|next`) replace this entry and keep
 * where the page came from; a change of query on this page keeps it too; any other move inside
 * the app carries this page as `from`.
 */
function moveOf(href: string, rel: string | undefined, fresh: boolean, pathname: string): 'fresh' | 'step' | 'keep' | 'from' {
  if (fresh || rel === 'up') return 'fresh';
  if (rel === 'prev' || rel === 'next') return 'step';
  if (href.startsWith('?') || href.split(/[?#]/)[0] === pathname) return 'keep';
  return 'from';
}

const plainClick = (e: MouseEvent<HTMLAnchorElement>) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** A router link that keeps the data store, and As of between model pages (spec 040 FR-001). */
function AppLink({ href, onClick, ...rest }: AnchorProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { search } = location;
  // a crumb up the section tree returns to the list as it was left (R-103 (7))
  const to = withStore(withAsOf(rest.rel === 'up' ? asLeft(href) : href, currentAsOf(search)), currentStore(search));
  const move = moveOf(href, rest.rel, 'data-fresh' in rest, location.pathname);
  const kept = move === 'step' || move === 'keep' ? (location.state as unknown) : undefined;
  return (
    <Link
      to={to}
      {...rest}
      replace={move === 'step'}
      state={kept}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || move !== 'from' || !plainClick(e)) return;
        // the page left, with the title its head shows now (not at render: it may have changed)
        e.preventDefault();
        void navigate(to, { state: { from: fromHere(location) } });
      }}
    />
  );
}

/**
 * The link the design system draws inside the app (`LinkProvider`): a page of the app moves
 * through React Router (no page load, the query cache kept); a file, a download, another tab or
 * another site stays a plain link.
 */
export const routerLink: DrawLink = (props: AnchorProps) => {
  if (inApp(props.href) && props.download === undefined && props.target === undefined) return <AppLink {...props} />;
  return <a {...props} />;
};

/** How a move made by code goes: replacing this history entry, carrying navigation state. */
export interface GoOptions {
  replace?: boolean;
  state?: unknown;
}

/** A move made by code (after a write, an assistant's page action): through the router for the app's pages. */
export function useGo(): (href: string, options?: GoOptions) => void {
  const navigate = useNavigate();
  return useCallback(
    (href: string, options?: GoOptions) => {
      if (inApp(href)) void navigate(withStore(href, currentStore()), options);
      else window.location.assign(href);
    },
    [navigate],
  );
}
