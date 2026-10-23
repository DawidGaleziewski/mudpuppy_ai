import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { NotFound } from '../pages/NotFound';
import { Portals } from '../pages/Portals';
import { Scans } from '../pages/Scans';

/** The console's routes, under `/app/` (served by the dashboard; Vite in development). */
export const routes = [
  { path: '/app/', element: <Portals /> },
  { path: '/app/portals/:portal/scans', element: <Scans /> },
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
