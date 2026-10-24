import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LinkProvider, PageHead, PageHeadProvider, Text } from '../src/design-system';
import { kindOf, useCameFromWiring } from '../src/app/cameFrom';
import { routerLink } from '../src/app/RouterAnchor';

const SCREENS = '/app/portals/shop/screens';
const SCREEN = `${SCREENS}/SC-012`;
const PROCESS = '/app/portals/shop/processes/PROC-001';

function Frame() {
  return (
    <LinkProvider draw={routerLink}>
      <PageHeadProvider value={useCameFromWiring()}>
        <Outlet />
      </PageHeadProvider>
    </LinkProvider>
  );
}

const pages = [
  {
    element: <Frame />,
    children: [
      { path: SCREENS, element: <PageHead title="Screens" crumbs={[{ label: 'shop', href: '/app/portals/shop' }, { label: 'Screens' }]} actions={<Text href={SCREEN}>Kontakt</Text>} /> },
      {
        path: SCREEN,
        element: <PageHead title="Kontakt" crumbs={[{ label: 'Screens', href: SCREENS }, { label: 'Kontakt' }]} actions={<Text href={PROCESS}>Napisz do nas</Text>} />,
      },
      { path: PROCESS, element: <PageHead title="Napisz do nas" crumbs={[{ label: 'Processes', href: '/app/portals/shop/processes' }, { label: 'Napisz do nas' }]} /> },
    ],
  },
];

const open = (path: string) => render(<RouterProvider router={createMemoryRouter(pages, { initialEntries: [path] })} />);

// Designer T-01 (D-65, FE-V31): one step back to the exact page left.
describe('Came from', () => {
  it('names the page left by its kind and title, and goes back to it', async () => {
    open(`${SCREENS}?part=kalkulator`);
    fireEvent.click(await screen.findByRole('link', { name: 'Kontakt' }));
    await screen.findByRole('heading', { level: 1, name: 'Kontakt' });
    // from its own list: no back link, the crumb carries the list's address
    expect(screen.queryByRole('link', { name: /^Back to/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Screens' }).getAttribute('href')).toBe(`${SCREENS}?part=kalkulator`);
    fireEvent.click(screen.getByRole('link', { name: 'Napisz do nas' }));
    await screen.findByRole('heading', { level: 1, name: 'Napisz do nas' });
    const back = screen.getByRole('link', { name: 'Back to Screen Kontakt' });
    expect(back.getAttribute('href')).toBe(SCREEN);
    fireEvent.click(back);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kontakt' })).toBeTruthy();
  });

  it('shows nothing on a page opened directly', async () => {
    open(PROCESS);
    await screen.findByRole('heading', { level: 1, name: 'Napisz do nas' });
    expect(screen.queryByRole('link', { name: /^Back to/ })).toBeNull();
  });

  it('knows each kind of page by its address', () => {
    expect(kindOf(PROCESS)).toBe('Process');
    expect(kindOf(SCREEN)).toBe('Screen');
    expect(kindOf('/app/portals/shop/screens/map')).toBe('Screens');
    expect(kindOf('/app/portals/shop/review')).toBe('Review');
    expect(kindOf('/app/portals/shop/docs/sessions/s1')).toBe('Session');
    expect(kindOf('/app/scans/01a1/trace')).toBe('Scan');
  });
});
