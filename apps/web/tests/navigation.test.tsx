import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routerLink } from '../src/app/RouterAnchor';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

// R-100: a link inside the app moves through the router; nothing loads the document again.
describe('Navigation', () => {
  it('opens the next page in place when a link is clicked, keeping what was fetched', async () => {
    const fetch = at('/app/', {
      '/api/portals': { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }], other_environments: [] },
      '/api/portals/shop/scans': { portal: 'shop', total: 0, scans: [] },
    });
    const link = await screen.findByRole('link', { name: 'shop' });
    // a router link: the click is taken by the app, so the browser does not load the address
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    fireEvent(link, event);
    expect(event.defaultPrevented).toBe(true);
    const scans = await screen.findByRole('link', { name: /Scans/ });
    fireEvent.click(scans);
    expect(await screen.findByRole('heading', { level: 1, name: /Scans/ })).toBeTruthy();
    // the portals list was fetched once, not again on every page
    expect(fetch.mock.calls.filter(([url]) => url === '/api/portals').length).toBe(1);
  });

  it('keeps files, downloads and new tabs plain links', () => {
    render(
      <MemoryRouter>
        {routerLink({ href: '/processes/P/export.zip', download: true, children: 'Download' })}
        {routerLink({ href: '/app/portals/shop', target: '_blank', children: 'New tab' })}
        {routerLink({ href: '/evidence/abc.png', children: 'Picture' })}
      </MemoryRouter>,
    );
    for (const name of ['Download', 'New tab', 'Picture']) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      fireEvent(screen.getByRole('link', { name }), event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
