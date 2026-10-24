import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const variations = [{ value: 'none', label: 'As before', hint: '' }, { value: 'wait_longer', label: 'Wait longer', hint: '' }];
const plan = {
  portal: 'shop',
  total: 2,
  types: [
    { value: 'focused', label: 'Focused', hint: 'Replays to the Start here and Focus marks and explores from there.' },
    { value: 'recheck', label: 'Recheck', hint: 'Replays to the Recheck marks.' },
    { value: 'retry', label: 'Retry a path', hint: 'Tries a failed action again.' },
  ],
  groups: [
    { kind: 'start', label: 'Start here', marks: [{ state: 'st-1', title: 'Oferty', route: '/oferty', reach: 'replays 1 step' }] },
    { kind: 'skip', label: 'Skip', marks: [{ state: null, title: '“oferty” on Start', route: '/', reach: null }] },
  ],
  personas: ['guest'],
  environments: ['local-dev'],
  variations,
};
const RUN = '01a16518-272d-7000-a376-65b105461ee2';
const recovery = {
  scan: RUN, portal: 'shop', persona: 'guest', environment: 'local-dev', status: { shape: 'stopped', word: 'Interrupted' }, reason: 'stopped by the BA or the session',
  failure_class: 'crawler error', steps: 12, pending: 3, last_state: ['st-1', 'Oferty', '/oferty'],
  failed: [{ transition: 'e-bad', label: 'Dalej', route: '/oferty', error: 'selector not found' }],
  attempts: [], variations,
};

describe('Plan next scan', () => {
  it('lists the marks by kind and asks before it starts', async () => {
    at('/app/portals/shop/scans/plan', { '/api/portals/shop/scans/plan': plan });
    expect(await screen.findByRole('heading', { level: 1, name: 'Plan next scan' })).toBeTruthy();
    expect(screen.getByText('replays 1 step')).toBeTruthy();
    expect(screen.getByText('no recorded way there for a replay')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Oferty' }).getAttribute('href')).toBe('/app/states/st-1');
    fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
    // the form checks its values first (React Hook Form), so the confirm opens a tick later
    await waitFor(() => expect(document.querySelector('dialog h2')?.textContent).toBe('Start a focused scan?'));
  });
});

describe('Recover', () => {
  it('says where the scan stopped and offers Resume, Retry and Skip', async () => {
    at(`/app/scans/${RUN}/recover`, { [`/api/scans/${RUN}/recovery`]: recovery, [`/api/scans/${RUN}`]: { detail: 'x' } });
    expect(await screen.findByText('Where it stopped')).toBeTruthy();
    expect(screen.getByText('crawler error')).toBeTruthy();
    expect(screen.getByText('selector not found')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip it in the next scans' }));
    expect(document.querySelector('dialog h2')?.textContent).toBe('Skip "Dalej" in the next scans?');
  });
});
