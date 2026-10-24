import { useEffect, useRef, type ComponentType } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { createBrowserRouter, NavigationType, Outlet, RouterProvider, useLocation, useNavigationType } from 'react-router';
import { LinkProvider, State } from '../design-system';
import { NotFound } from '../pages/NotFound';
import { RecordingRedirect } from './Recording';
import { currentAsOf } from './asOf';
import { currentStore } from './store';
import { rememberAddress } from './listAddress';
import { routerLink } from './RouterAnchor';
import { ShellLayout } from './Shell';
import { api } from './state/api';
import { makeStore, type AppDispatch } from './state/store';

/** Where each visited entry of the history was scrolled to, by its location key (this tab only). */
const scrolled = new Map<string, number>();
/** Its data may arrive a moment later: try again while the page grows. */
const TRIES_MS = [0, 100, 300, 800, 1500];

function later(each: () => boolean | void): () => void {
  const timers: number[] = [];
  let done = false;
  for (const ms of TRIES_MS)
    timers.push(
      window.setTimeout(() => {
        if (!done) done = each() === true;
      }, ms),
    );
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/**
 * A move inside the app scrolls as a browser would (R-103 (7)): Back and Forward return to where
 * that page was left; a new page opens at the top, or at the `#anchor` it names once drawn. A
 * change of the query alone (a filter) keeps the scroll.
 */
function useScrollOnMove() {
  const { pathname, search, hash, key } = useLocation();
  const type = useNavigationType();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const keep = () => scrolled.set(key, window.scrollY);
    window.addEventListener('scroll', keep, { passive: true });
    return () => window.removeEventListener('scroll', keep);
  }, [key]);
  useEffect(() => {
    rememberAddress(pathname, search);
    const page = `${pathname}${hash}`;
    const moved = shown.current !== page;
    shown.current = page;
    const back = type === NavigationType.Pop ? scrolled.get(key) : undefined;
    if (back !== undefined)
      return later(() => {
        window.scrollTo?.(0, back);
        return Math.abs(window.scrollY - back) < 2;
      });
    if (!moved) return;
    if (!hash) {
      window.scrollTo?.(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    return later(() => document.getElementById(id)?.scrollIntoView?.());
  }, [pathname, search, hash, key, type]);
}

/**
 * A change of As of (spec 040 FR-001) or of the data store (spec 019) reads the pages again: their
 * queries are kept under the same keys at every version and in every store, so the cache is reset
 * when either changes.
 */
function useAsOfReset() {
  const { search } = useLocation();
  const asOf = currentAsOf(search);
  const store = currentStore(search);
  const dispatch = useDispatch<AppDispatch>();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dispatch(api.util.resetApiState());
  }, [asOf, store, dispatch]);
}

/**
 * Every page under it draws its links through React Router (no page load between pages), inside
 * the one frame (R-103 (5)).
 */
function Routed() {
  useScrollOnMove();
  useAsOfReset();
  return (
    <LinkProvider draw={routerLink}>
      <ShellLayout>
        <Outlet />
      </ShellLayout>
    </LinkProvider>
  );
}

/**
 * A page whose code loads when it is first opened (R-105 (1)): each page is its own chunk, so the
 * first load holds the frame, the design system and the state libraries only.
 */
function page<K extends string>(path: string, load: () => Promise<Record<K, ComponentType>>, name: K) {
  return { path, lazy: { Component: async () => (await load())[name] } };
}

/** The console's pages, under `/app/` (served by the dashboard; Vite in development). */
const pages = [
  page('/app/', () => import('../pages/Portals'), 'Portals'),
  page('/app/portals/new', () => import('../pages/NewPortal'), 'NewPortal'),
  page('/app/portals/:portal', () => import('../pages/PortalHome'), 'PortalHome'),
  page('/app/portals/:portal/changes', () => import('../pages/Changes'), 'Changes'),
  page('/app/portals/:portal/changes/:id', () => import('../pages/Change'), 'Change'),
  page('/app/portals/:portal/docs', () => import('../pages/Docs'), 'Docs'),
  page('/app/portals/:portal/docs/sessions/:session', () => import('../pages/DocSession'), 'DocSession'),
  page('/app/portals/:portal/docs/:key', () => import('../pages/DocRecord'), 'DocRecord'),
  page('/app/portals/:portal/processes', () => import('../pages/Processes'), 'Processes'),
  page('/app/portals/:portal/processes/:key', () => import('../pages/Process'), 'Process'),
  page('/app/portals/:portal/processes/:key/compare', () => import('../pages/ProcessCompare'), 'ProcessCompare'),
  page('/app/portals/:portal/processes/:key/history', () => import('../pages/ProcessHistory'), 'ProcessHistory'),
  page('/app/portals/:portal/processes/:key/documentation', () => import('../pages/ProcessDocumentation'), 'ProcessDocumentation'),
  page('/app/portals/:portal/review', () => import('../pages/Review'), 'Review'),
  page('/app/portals/:portal/rules', () => import('../pages/Rules'), 'Rules'),
  page('/app/portals/:portal/same-screen', () => import('../pages/SameScreen'), 'SameScreen'),
  page('/app/portals/:portal/rules/:key', () => import('../pages/Rule'), 'Rule'),
  page('/app/portals/:portal/scans', () => import('../pages/Scans'), 'Scans'),
  page('/app/portals/:portal/settings', () => import('../pages/Settings'), 'Settings'),
  page('/app/portals/:portal/screens', () => import('../pages/Screens'), 'Screens'),
  page('/app/portals/:portal/screens/map', () => import('../pages/ScreensMap'), 'ScreensMap'),
  page('/app/portals/:portal/screens/recorded', () => import('../pages/RecordedPages'), 'RecordedPages'),
  page('/app/portals/:portal/screens/:screenKey', () => import('../pages/Screen'), 'Screen'),
  { path: '/app/states/:state', element: <RecordingRedirect /> },
  page('/app/errors/:ref', () => import('../pages/ErrorRef'), 'ErrorRef'),
  page('/app/portals/:portal/scans/plan', () => import('../pages/ScanPlan'), 'ScanPlan'),
  page('/app/portals/:portal/scans/by-process', () => import('../pages/ScansByProcess'), 'ScansByProcess'),
  page('/app/portals/:portal/scans/activity', () => import('../pages/Activity'), 'Activity'),
  page('/app/portals/:portal/screens/access', () => import('../pages/Access'), 'Access'),
  page('/app/search', () => import('../pages/Search'), 'Search'),
  page('/app/portals/:portal/workbench', () => import('../pages/Workbench'), 'Workbench'),
  page('/app/portals/:portal/workbench/live', () => import('../features/workbench-live/LiveWorkbench'), 'LiveWorkbench'),
  page('/app/glossary', () => import('../pages/Glossary'), 'Glossary'),
  page('/app/glossary/pages/:slug', () => import('../pages/Glossary'), 'GlossaryArticle'),
  page('/app/glossary/wiki', () => import('../pages/Glossary'), 'Wiki'),
  page('/app/glossary/wiki/:slug', () => import('../pages/Glossary'), 'WikiArticle'),
  page('/app/scans/:scan/recover', () => import('../pages/ScanRecover'), 'ScanRecover'),
  page('/app/scans/:scan', () => import('../pages/Scan'), 'Scan'),
  page('/app/scans/:scan/:tab', () => import('../pages/Scan'), 'Scan'),
  { path: '*', element: <NotFound /> },
];

export const routes = [
  {
    element: <Routed />,
    children: pages,
    // the first page's code is still on its way (a move between pages keeps the old page instead)
    hydrateFallbackElement: <State loading title="Opening the page" />,
  },
];

const store = makeStore();
const router = createBrowserRouter(routes);

export function App() {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
