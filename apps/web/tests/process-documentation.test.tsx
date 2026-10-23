import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = '/api/portals/shop/processes/PROC-001/export';
const page = (tab: string, html: string | null) => ({
  portal: 'shop',
  key: 'PROC-001',
  tabs: [{ file: 'README.md', label: 'README' }, { file: 'GAPS.md', label: 'Gaps' }],
  tab,
  html,
  error: html === null ? 'reference-insurer has no documented process PROC-001' : null,
  zip: `${API}.zip`,
});

describe('Process documentation', () => {
  it('shows the export a file per tab; its own links move in place; the zip downloads', async () => {
    const fetch = at('/app/portals/shop/processes/PROC-001/documentation', {
      [`${API}?tab=README.md`]: page('README.md', '<h2>PROC-001 Quote</h2><p><a href="/app/portals/shop/processes/PROC-001/documentation?tab=GAPS.md">Gaps</a></p>'),
      [`${API}?tab=GAPS.md`]: page('GAPS.md', '<h2>Gaps</h2><p>None.</p>'),
    });
    expect(await screen.findByText('PROC-001 Quote')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download the folder (zip)' }).getAttribute('href')).toBe(`${API}.zip`);
    const link = screen.getAllByRole('link', { name: 'Gaps' }).find((a) => a.closest('article')) as HTMLElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(await screen.findByText('None.')).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain(`${API}?tab=GAPS.md`);
  });

  it('says why when the export cannot be built', async () => {
    at('/app/portals/shop/processes/PROC-001/documentation', { [`${API}?tab=README.md`]: page('README.md', null) });
    expect(await screen.findByText('No documentation export for PROC-001')).toBeTruthy();
  });
});
