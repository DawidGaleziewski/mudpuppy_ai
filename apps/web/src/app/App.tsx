import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserRouter, Outlet, RouterProvider, useLocation } from 'react-router';
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
import { routerLink } from './RouterAnchor';

/**
 * A move inside the app scrolls as a page load would: to the top of a new page, or to the
 * `#anchor` it names once the page has drawn it (its data may arrive a moment later).
 */
function useScrollOnMove() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo?.(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const tries = [0, 200, 600, 1500].map((ms) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView?.(), ms));
    return () => tries.forEach((t) => window.clearTimeout(t));
  }, [pathname, hash]);
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
  const client = useQueryClient();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void client.resetQueries();
  }, [asOf, store, client]);
}

/** Every page under it draws its links through React Router (no page load between pages). */
function Routed() {
  useScrollOnMove();
  useAsOfReset();
  return (
    <LinkProvider draw={routerLink}>
      <Outlet />
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

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
