import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../src/app/App';
import { switchHref } from '../src/app/PortalMenu';
import { routerLink } from '../src/app/RouterAnchor';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

// R-100: a link inside the app moves through the router; nothing loads the document again.
describe('Navigation', () => {
  it('opens the next page in place when a link is clicked, keeping what was fetched', async () => {
    const fetch = at('/app/', {
      '/api/portals': { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }, { id: 'bank', scans: 0, running: 0, last_scan_at: null }], other_environments: [] },
      '/api/portals/shop/scans': { portal: 'shop', total: 0, scans: [] },
    });
    const link = await within(screen.getByRole('main')).findByRole('link', { name: 'shop' });
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

  it('keeps the frame on a nav click: the header and nav are not drawn again (R-103 (5))', async () => {
    at('/app/portals/shop/scans', {
      '/api/portals': { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }], other_environments: [] },
      '/api/portals/shop/scans': { portal: 'shop', total: 0, scans: [] },
    });
    expect(await screen.findByRole('heading', { level: 1, name: /Scans/ })).toBeTruthy();
    const header = screen.getByRole('banner');
    const nav = screen.getByRole('navigation', { name: 'Portal sections' });
    fireEvent.click(screen.getByRole('link', { name: 'Processes' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Processes/ })).toBeTruthy();
    expect(screen.getByRole('banner')).toBe(header);
    expect(screen.getByRole('navigation', { name: 'Portal sections' })).toBe(nav);
    expect(screen.getByRole('link', { name: 'Processes' }).getAttribute('aria-current')).toBe('page');
  });

  it('switches portal from the header and stays on Processes (FE-N02, R-103 (3))', async () => {
    const list = { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }, { id: 'bank', scans: 0, running: 0, last_scan_at: null }], other_environments: [] };
    at('/app/portals/shop/processes?store=main:local-dev', { '/api/portals': list });
    expect(await screen.findByRole('heading', { level: 1, name: /Processes/ })).toBeTruthy();
    const banner = screen.getByRole('banner');
    fireEvent.click(within(banner).getByRole('button', { name: 'Portal: shop' }));
    const picker = within(banner).getByRole('menu', { name: 'Switch portal' });
    expect((await within(picker).findByRole('menuitemradio', { name: 'bank' })).getAttribute('href')).toBe('/app/portals/bank/processes?store=main%3Alocal-dev');
    fireEvent.click(within(picker).getByRole('menuitemradio', { name: 'bank' }));
    // the same section in the other portal, the data store kept; the menu closed
    await within(banner).findByRole('button', { name: 'Portal: bank' });
    expect(within(banner).queryByRole('menu')).toBeNull();
    expect(screen.getByRole('link', { name: 'Processes' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Processes' }).getAttribute('href')).toContain('/app/portals/bank/processes');
  });

  it('opens a detail page’s list in the other portal, and a past version at Now', () => {
    expect(switchHref('/app/portals/shop/processes/PROC-001', '', 'bank')).toBe('/app/portals/bank/processes');
    expect(switchHref('/app/portals/shop/screens/map', '', 'bank')).toBe('/app/portals/bank/screens/map');
    expect(switchHref('/app/scans/01a110d5-2028/trace', '', 'bank')).toBe('/app/portals/bank/scans');
    expect(switchHref('/app/portals/shop/rules/BR-021', '?as_of=4', 'bank')).toBe('/app/portals/bank/rules?as_of=now');
    expect(switchHref('/app/glossary', '', 'bank')).toBe('/app/portals/bank');
    expect(switchHref('/app/', '', 'bank')).toBe('/app/portals/bank');
  });

  it('shows every section on All portals, the portal ones shut with the reason (designer T-12)', async () => {
    const list = { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }], other_environments: [] };
    at('/app/portals/shop/scans', { '/api/portals': list, '/api/portals/shop/scans': { portal: 'shop', total: 0, scans: [] } });
    expect(await screen.findByRole('heading', { level: 1, name: /Scans/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Portal sections' })).getByRole('link', { name: 'All portals' }));
    // a click inside the app: no first-visit move to the only portal
    expect(await screen.findByRole('heading', { level: 1, name: 'All portals' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Portal sections' });
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    const processes = within(nav).getByRole('link', { name: 'Processes' });
    expect(processes.getAttribute('aria-disabled')).toBe('true');
    expect(processes.hasAttribute('href')).toBe(false);
    expect(document.getElementById(processes.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Pick a portal to open these.');
    // the store half reads "per portal": each portal has its own
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Data store: per portal' }).getAttribute('aria-disabled')).toBe('true');
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

// R-105 (1): each page is its own chunk, loaded when it is first opened.
describe('Code splitting', () => {
  const wait = { timeout: 10_000 };
  it('loads the code of each page when it is opened, and of the next one on a move', async () => {
    at(
      '/app/',
      {
        '/api/portals': { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }], other_environments: [] },
        '/api/portals/shop/scans': { portal: 'shop', total: 0, scans: [] },
      },
      200,
      routes,
    );
    const main = await screen.findByRole('main', {}, wait);
    fireEvent.click(await within(main).findByRole('link', { name: 'shop' }, wait));
    fireEvent.click(await screen.findByRole('link', { name: /Scans/ }, wait));
    expect(await screen.findByRole('heading', { level: 1, name: /Scans/ }, wait)).toBeTruthy();
  }, 30_000);
});
