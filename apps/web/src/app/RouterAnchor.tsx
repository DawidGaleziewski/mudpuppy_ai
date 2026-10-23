import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { AnchorProps, DrawLink } from '../design-system';
import { currentAsOf, withAsOf } from './asOf';
import { currentStore, withStore } from './store';

/** An address the app's router draws: a page under `/app/`, or a change of query or hash on this page. */
export function inApp(href: string): boolean {
  return href === '/app' || href.startsWith('/app/') || href.startsWith('?');
}

/** A router link that keeps the data store, and As of between model pages (spec 040 FR-001). */
function AppLink({ href, ...rest }: AnchorProps) {
  const { search } = useLocation();
  return <Link to={withStore(withAsOf(href, currentAsOf(search)), currentStore(search))} {...rest} />;
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

/** A move made by code (after a write, an assistant's page action): through the router for the app's pages. */
export function useGo(): (href: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (href: string) => {
      if (inApp(href)) void navigate(withStore(href, currentStore()));
      else window.location.assign(href);
    },
    [navigate],
  );
}
