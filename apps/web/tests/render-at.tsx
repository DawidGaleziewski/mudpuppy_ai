import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../src/app/App';
import { makeStore } from '../src/app/state/store';

/**
 * Render the app at `path` with the API answering `bodies[url]` (status `status`) and 404 for any
 * other URL; a key "POST /api/…" answers only that method (a list and its create share a URL).
 * Returns the fetch mock, to read the URLs the page asked for.
 */
export function at(path: string, bodies: Record<string, unknown>, status = 200) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    // "POST /api/…" answers only that method; a plain URL answers every method.
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}` in bodies ? `${method} ${url}` : url;
    return Promise.resolve(
      new Response(JSON.stringify(bodies[key] ?? { detail: 'This address does not exist.' }), {
        status: key in bodies ? status : 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  // a fresh store per test: no cached read leaks from one test into the next
  render(
    <Provider store={makeStore()}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </Provider>,
  );
  return fetch;
}

/** Press `button` in the confirm dialog named `name`; waits for it (a form checks its values first). */
export async function confirmIn(name: string, button: string) {
  const dialog = await screen.findByRole('dialog', { name });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
}
