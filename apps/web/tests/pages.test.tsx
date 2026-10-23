import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

// Two scans started in the same millisecond share the short form (D-9, Q6).
const RUN_2 = '01a16391-7c00-7000-8f3e-5c1a9b27d460';
const RUN_1 = '01a16388-1f2c-7000-8f3e-5c1a9b27d461';
const RUN_0 = '01a16388-1f2c-7001-8f3e-5c1a9b27d462';

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
    const main = await screen.findByRole('main');
    expect(await within(main).findByRole('link', { name: 'reference-insurer-local' })).toBeTruthy();
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
          { id: RUN_2, persona: 'guest', mode: 'map', kind: 'AI scan', status: { shape: 'running', word: 'Running' }, steps_used: 10, max_steps: 40, started_at: '2026-10-23T01:00:00Z', ended_at: null, warning: null },
          { id: RUN_1, persona: 'guest', mode: 'map', kind: 'AI scan', status: { shape: 'ok', word: 'Completed' }, steps_used: 49, max_steps: 400, started_at: '2026-10-22T23:00:00Z', ended_at: '2026-10-22T23:20:00Z', warning: null },
          { id: RUN_0, persona: 'guest', mode: 'map', kind: 'AI scan', status: { shape: 'ok', word: 'Completed' }, steps_used: 9, max_steps: 400, started_at: '2026-10-22T22:00:00Z', ended_at: '2026-10-22T22:20:00Z', warning: null },
        ],
      },
    });
    expect((await screen.findByRole('progressbar', { name: 'AI scan 01a16391-7c00' })).getAttribute('aria-valuenow')).toBe('10');
    // the 13-character short form, linking with the full id; two that share it show the third group (Q6)
    const row = screen.getByRole('rowheader', { name: /^01a16388-1f2c-7000/ });
    expect(within(row).getByRole('link').getAttribute('href')).toBe(`/app/scans/${RUN_1}`);
    expect(within(row).getByRole('link').getAttribute('title')).toBe(RUN_1);
    expect(screen.getByRole('rowheader', { name: /^01a16388-1f2c-7001/ })).toBeTruthy();
    expect(within(row).getByRole('button', { name: `Copy the full scan id ${RUN_1}` })).toBeTruthy();
    expect(screen.getAllByText('Completed')).toHaveLength(2);
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

const home = {
  portal: 'shop',
  environment: 'local-dev',
  model_seq: 4,
  model_built_at: '2026-10-22T20:00:00Z',
  lanes: [{ part: 'shop', release: 'r-12', observed: true, since: '2026-10-22T19:00:00Z', was: 'r-11' }],
  last_scan: { id: 'run-7', started_at: '2026-10-22T21:00:00Z', status: { shape: 'ok', word: 'Completed' }, kind: 'AI scan', steps: 49, summary: '22 Oct 21:00Z · 49 steps' },
  needs: {
    total: 12,
    by_kind: [{ kind: 'questions', label: 'Questions', count: 12 }],
    top: [
      {
        kind: 'questions',
        id: 'Q-3',
        chip: { word: 'question', variant: null },
        claim: 'Is the discount limited to one per order?',
        where: 'Checkout',
        hint: 'Answer it',
        at: '2026-10-22T21:10:00Z',
        status: null,
      },
    ],
  },
  changes: {
    all: 3,
    needs: 1,
    explained: 2,
    by_process: [{ key: 'PROC-001', name: 'Buy a policy', changes: 3, needs: 1, explained: 2 }],
  },
  processes: 2,
  proposed: 1,
  rules: { total: 5, by_status: [{ status: { shape: 'ok', word: 'Confirmed' }, count: 5 }] },
};

describe('Portal home', () => {
  it('puts what needs you first, then the last scan, the releases and the changes', async () => {
    at('/app/portals/shop', { '/api/portals/shop/home': home });
    expect(await screen.findByText('Is the discount limited to one per order?')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'shop' })).toBeTruthy();
    expect(screen.getByRole('region', { name: /Needs you/ })).toBeTruthy();
    expect(screen.getByText('run-7')).toBeTruthy();
    expect(screen.getByText('r-12')).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Buy a policy' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Scans' }).getAttribute('href')).toBe('/app/portals/shop/scans');
  });

  it('shows Get started on a portal that was never scanned (designer Q11)', async () => {
    at('/app/portals/shop', {
      '/api/portals/shop/home': {
        ...home,
        last_scan: null,
        lanes: [],
        needs: { total: 0, by_kind: [], top: [] },
        changes: { all: 0, needs: 0, explained: 0, by_process: [] },
        rules: { total: 0, by_status: [] },
      },
    });
    expect(await screen.findByText('No scan yet. Ask the assistant to start one.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Get started' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'First scan' }).getAttribute('href')).toBe('/app/portals/shop/scans/plan');
    expect(screen.queryByText('Nothing waits for you on this portal.')).toBeNull();
  });

  it('shows the API reason for an unknown portal', async () => {
    at('/app/portals/nowhere', { '/api/portals/nowhere/home': { detail: 'There is no portal nowhere here.' } }, 404);
    expect((await screen.findByRole('alert')).textContent).toContain('There is no portal nowhere here.');
  });
});
