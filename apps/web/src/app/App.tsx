import { useEffect, useRef } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { createBrowserRouter, NavigationType, Outlet, RouterProvider, useLocation, useNavigationType } from 'react-router';
import { LinkProvider } from '../design-system';
import { Access } from '../pages/Access';
import { Activity } from '../pages/Activity';
import { Change } from '../pages/Change';
import { ScansByProcess } from '../pages/ScansByProcess';
import { Workbench } from '../pages/Workbench';
import { Search } from '../pages/Search';
import { Changes } from '../pages/Changes';
import { DocRecord } from '../pages/DocRecord';
import { Docs } from '../pages/Docs';
import { DocSession } from '../pages/DocSession';
import { ErrorRef } from '../pages/ErrorRef';
import { Glossary, GlossaryArticle, Wiki, WikiArticle } from '../pages/Glossary';
import { NewPortal } from '../pages/NewPortal';
import { NotFound } from '../pages/NotFound';
import { PortalHome } from '../pages/PortalHome';
import { Portals } from '../pages/Portals';
import { Process } from '../pages/Process';
import { ProcessCompare } from '../pages/ProcessCompare';
import { ProcessDocumentation } from '../pages/ProcessDocumentation';
import { ProcessHistory } from '../pages/ProcessHistory';
import { Processes } from '../pages/Processes';
import { RecordedPages } from '../pages/RecordedPages';
import { RecordingRedirect } from './Recording';
import { Review } from '../pages/Review';
import { Rule } from '../pages/Rule';
import { Rules } from '../pages/Rules';
import { SameScreen } from '../pages/SameScreen';
import { Scan } from '../pages/Scan';
import { ScanPlan } from '../pages/ScanPlan';
import { ScanRecover } from '../pages/ScanRecover';
import { Scans } from '../pages/Scans';
import { Screen } from '../pages/Screen';
import { Settings } from '../pages/Settings';
import { Screens } from '../pages/Screens';
import { ScreensMap } from '../pages/ScreensMap';
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

/** The console's pages, under `/app/` (served by the dashboard; Vite in development). */
const pages = [
  { path: '/app/', element: <Portals /> },
  { path: '/app/portals/new', element: <NewPortal /> },
  { path: '/app/portals/:portal', element: <PortalHome /> },
  { path: '/app/portals/:portal/changes', element: <Changes /> },
  { path: '/app/portals/:portal/changes/:id', element: <Change /> },
  { path: '/app/portals/:portal/docs', element: <Docs /> },
  { path: '/app/portals/:portal/docs/sessions/:session', element: <DocSession /> },
  { path: '/app/portals/:portal/docs/:key', element: <DocRecord /> },
  { path: '/app/portals/:portal/processes', element: <Processes /> },
  { path: '/app/portals/:portal/processes/:key', element: <Process /> },
  { path: '/app/portals/:portal/processes/:key/compare', element: <ProcessCompare /> },
  { path: '/app/portals/:portal/processes/:key/history', element: <ProcessHistory /> },
  { path: '/app/portals/:portal/processes/:key/documentation', element: <ProcessDocumentation /> },
  { path: '/app/portals/:portal/review', element: <Review /> },
  { path: '/app/portals/:portal/rules', element: <Rules /> },
  { path: '/app/portals/:portal/same-screen', element: <SameScreen /> },
  { path: '/app/portals/:portal/rules/:key', element: <Rule /> },
  { path: '/app/portals/:portal/scans', element: <Scans /> },
  { path: '/app/portals/:portal/settings', element: <Settings /> },
  { path: '/app/portals/:portal/screens', element: <Screens /> },
  { path: '/app/portals/:portal/screens/map', element: <ScreensMap /> },
  { path: '/app/portals/:portal/screens/recorded', element: <RecordedPages /> },
  { path: '/app/portals/:portal/screens/:screenKey', element: <Screen /> },
  { path: '/app/states/:state', element: <RecordingRedirect /> },
  { path: '/app/errors/:ref', element: <ErrorRef /> },
  { path: '/app/portals/:portal/scans/plan', element: <ScanPlan /> },
  { path: '/app/portals/:portal/scans/by-process', element: <ScansByProcess /> },
  { path: '/app/portals/:portal/scans/activity', element: <Activity /> },
  { path: '/app/portals/:portal/screens/access', element: <Access /> },
  { path: '/app/search', element: <Search /> },
  { path: '/app/portals/:portal/workbench', element: <Workbench /> },
  // spec 075: the live Workbench (A2UI, ~450 kB) loads only when opened
  {
    path: '/app/portals/:portal/workbench/live',
    lazy: async () => ({ Component: (await import('../features/workbench-live/LiveWorkbench')).LiveWorkbench }),
  },
  { path: '/app/glossary', element: <Glossary /> },
  { path: '/app/glossary/pages/:slug', element: <GlossaryArticle /> },
  { path: '/app/glossary/wiki', element: <Wiki /> },
  { path: '/app/glossary/wiki/:slug', element: <WikiArticle /> },
  { path: '/app/scans/:scan/recover', element: <ScanRecover /> },
  { path: '/app/scans/:scan', element: <Scan /> },
  { path: '/app/scans/:scan/:tab', element: <Scan /> },
  { path: '*', element: <NotFound /> },
];

export const routes = [{ element: <Routed />, children: pages }];

const store = makeStore();
const router = createBrowserRouter(routes);

export function App() {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
