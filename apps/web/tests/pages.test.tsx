import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../src/app/App';

/** Render the app at `path` with the API answering `bodies[path]` (status 200) or `status`. */
function at(path: string, bodies: Record<string, unknown>, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(bodies[url] ?? { detail: 'This address does not exist.' }), {
          status: url in bodies ? status : 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Portals page', () => {
  it("lists this environment's portals and the others apart", async () => {
    at('/app/', {
      '/api/portals': {
        environment: 'local-dev',
        portals: [{ id: 'reference-insurer-local', scans: 3, running: 1, last_scan_at: '2026-10-23T00:12:00Z' }],
        other_environments: ['reference-insurer'],
      },
    });
    expect(await screen.findByRole('link', { name: 'reference-insurer-local' })).toBeTruthy();
    expect(screen.getByText('1 running')).toBeTruthy();
    expect(screen.getByText('1 portals · environment local-dev')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Portals' })).toBeTruthy();
  });

  it('says what failed and what to do when the API is down', async () => {
    at('/app/', { '/api/portals': { detail: 'The store is locked.' } }, 500);
    expect((await screen.findByRole('alert')).textContent).toContain('The store is locked.');
  });
});

describe('Not found', () => {
  it('answers an unknown address with its own page and the way back', async () => {
    at('/app/nothing/here', {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Portals' }).getAttribute('href')).toBe('/app/');
  });
});

describe('Scans page', () => {
  it('shows a running scan as a meter and every scan in the table', async () => {
    at('/app/portals/shop/scans', {
      '/api/portals/shop/scans': {
        portal: 'shop',
        total: 2,
        scans: [
          { id: 'run-2', persona: 'guest', mode: 'map', status: 'running', steps_used: 10, max_steps: 40, started_at: '2026-10-23T01:00:00Z', ended_at: null, warning: null },
          { id: 'run-1', persona: 'guest', mode: 'map', status: 'completed', steps_used: 49, max_steps: 400, started_at: '2026-10-22T23:00:00Z', ended_at: '2026-10-22T23:20:00Z', warning: null },
        ],
      },
    });
    expect((await screen.findByRole('progressbar')).getAttribute('aria-valuenow')).toBe('10');
    expect(screen.getByRole('rowheader', { name: 'run-1' })).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('2 scans · 1 running')).toBeTruthy();
  });

  it('shows the API reason for an unknown portal', async () => {
    at('/app/portals/nowhere/scans', { '/api/portals/nowhere/scans': { detail: 'There is no portal nowhere here.' } }, 404);
    expect((await screen.findByRole('alert')).textContent).toContain('There is no portal nowhere here.');
  });

  it('says so when the portal has no scans', async () => {
    at('/app/portals/shop/scans', { '/api/portals/shop/scans': { portal: 'shop', total: 0, scans: [] } });
    expect(await screen.findByText('No scans yet. Start one from the chat.')).toBeTruthy();
  });
});
