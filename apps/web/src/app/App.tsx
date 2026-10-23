import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Change } from '../pages/Change';
import { Changes } from '../pages/Changes';
import { DocRecord } from '../pages/DocRecord';
import { Docs } from '../pages/Docs';
import { DocSession } from '../pages/DocSession';
import { NotFound } from '../pages/NotFound';
import { PortalHome } from '../pages/PortalHome';
import { Portals } from '../pages/Portals';
import { Process } from '../pages/Process';
import { ProcessCompare } from '../pages/ProcessCompare';
import { ProcessHistory } from '../pages/ProcessHistory';
import { Processes } from '../pages/Processes';
import { RecordedPages } from '../pages/RecordedPages';
import { Review } from '../pages/Review';
import { Rule } from '../pages/Rule';
import { Rules } from '../pages/Rules';
import { Scan } from '../pages/Scan';
import { Scans } from '../pages/Scans';
import { Screen } from '../pages/Screen';
import { Screens } from '../pages/Screens';
import { ScreensMap } from '../pages/ScreensMap';

/** The console's routes, under `/app/` (served by the dashboard; Vite in development). */
export const routes = [
  { path: '/app/', element: <Portals /> },
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
  { path: '/app/portals/:portal/review', element: <Review /> },
  { path: '/app/portals/:portal/rules', element: <Rules /> },
  { path: '/app/portals/:portal/rules/:key', element: <Rule /> },
  { path: '/app/portals/:portal/scans', element: <Scans /> },
  { path: '/app/portals/:portal/screens', element: <Screens /> },
  { path: '/app/portals/:portal/screens/map', element: <ScreensMap /> },
  { path: '/app/portals/:portal/screens/recorded', element: <RecordedPages /> },
  { path: '/app/portals/:portal/screens/:screenKey', element: <Screen /> },
  { path: '/app/scans/:scan', element: <Scan /> },
  { path: '/app/scans/:scan/:tab', element: <Scan /> },
  { path: '*', element: <NotFound /> },
];

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
