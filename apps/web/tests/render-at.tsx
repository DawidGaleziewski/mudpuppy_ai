import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ComponentType } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../src/app/App';
import { makeStore } from '../src/app/state/store';

type Lazy = { Component?: () => Promise<ComponentType> };

/** The routes with every page's code already loaded: a test waits for its page's data only. */
async function loaded(list: RouteObject[]): Promise<RouteObject[]> {
  return Promise.all(
    list.map(async ({ lazy, children, ...route }) => {
      const load = (lazy as Lazy | undefined)?.Component;
      const kids = children ? { children: await loaded(children) } : {};
      return { ...route, ...kids, ...(load ? { Component: await load() } : {}) } as RouteObject;
    }),
  );
}

const pages = await loaded(routes);

/**
 * Render the app at `path` with the API answering `bodies[url]` (status `status`) and 404 for any
 * other URL; a key "POST /api/…" answers only that method (a list and its create share a URL).
 * Returns the fetch mock, to read the URLs the page asked for. `table` is the app's own lazy
 * routes for a test of the code splitting itself.
 */
export function at(path: string, bodies: Record<string, unknown>, status = 200, table: RouteObject[] = pages) {
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
      <RouterProvider router={createMemoryRouter(table, { initialEntries: [path] })} />
    </Provider>,
  );
  return fetch;
}

/** Press `button` in the confirm dialog named `name`; waits for it (a form checks its values first). */
export async function confirmIn(name: string, button: string) {
  const dialog = await screen.findByRole('dialog', { name });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
}
