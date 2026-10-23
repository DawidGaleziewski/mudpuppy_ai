import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const term = {
  id: 'frontier', term: 'Frontier', category: 'mudpuppy', short: 'What the crawler has not visited yet.',
  html: '<p>See <a href="/app/glossary/pages/frontier">the long page</a>.</p>', example: null, appears_in: ['Scans'],
  related: [{ id: 'budget', title: 'Budget' }], page: { id: 'frontier', title: 'The frontier, explained' }, wiki: null, retired: null,
  changed_in: 'R-22', changed_on: '2026-10-10',
};
const glossary = (q: string, groups: unknown[]) => ({ scope: 'MudPuppy terms, not the portal glossary.', q, groups, problems: [] });

describe('Glossary', () => {
  it('lists the terms by group, filters as you type, and opens a longer page in place', async () => {
    const fetch = at('/app/glossary', {
      '/api/glossary?q=': glossary('', [{ category: 'mudpuppy', group: 'Crawling', terms: [term] }]),
      '/api/glossary?q=zzz': glossary('zzz', []),
      '/api/glossary/pages/frontier': { title: 'The frontier, explained', html: '<p>Long.</p>' },
    });
    expect(await screen.findByText('What the crawler has not visited yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Budget' }).getAttribute('href')).toBe('/app/glossary#budget');
    expect(screen.getByRole('link', { name: 'Help and glossary' }).getAttribute('href')).toBe('/app/glossary');
    fireEvent.click(screen.getByRole('link', { name: 'the long page' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The frontier, explained' })).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain('/api/glossary/pages/frontier');
  });

  it('says when no term matches', async () => {
    at('/app/glossary?q=zzz', { '/api/glossary?q=zzz': glossary('zzz', []) });
    expect(await screen.findByText('No term matches “zzz”')).toBeTruthy();
  });
});
