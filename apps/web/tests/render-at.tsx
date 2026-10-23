import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../src/app/App';

/**
 * Render the app at `path` with the API answering `bodies[url]` (status `status`) and 404 for any
 * other URL. Returns the fetch mock, to read the URLs the page asked for.
 */
export function at(path: string, bodies: Record<string, unknown>, status = 200) {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(bodies[url] ?? { detail: 'This address does not exist.' }), {
        status: url in bodies ? status : 404,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
  return fetch;
}
