import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { NotFound } from '../pages/NotFound';
import { PortalHome } from '../pages/PortalHome';
import { Portals } from '../pages/Portals';
import { RecordedPages } from '../pages/RecordedPages';
import { Scan } from '../pages/Scan';
import { Scans } from '../pages/Scans';
import { Screen } from '../pages/Screen';
import { Screens } from '../pages/Screens';
import { ScreensMap } from '../pages/ScreensMap';

/** The console's routes, under `/app/` (served by the dashboard; Vite in development). */
export const routes = [
  { path: '/app/', element: <Portals /> },
  { path: '/app/portals/:portal', element: <PortalHome /> },
  { path: '/app/portals/:portal/scans', element: <Scans /> },
  { path: '/app/portals/:portal/screens', element: <Screens /> },
  { path: '/app/portals/:portal/screens/map', element: <ScreensMap /> },
  { path: '/app/portals/:portal/screens/recorded', element: <RecordedPages /> },
  { path: '/app/portals/:portal/screens/:screenKey', element: <Screen /> },
  { path: '/app/scans/:scan', element: <Scan /> },
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
