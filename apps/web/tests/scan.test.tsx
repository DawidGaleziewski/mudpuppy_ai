// One scan's page and its Graph tab (spec 054) over a stubbed API; restarts ask first.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SCAN, scanGraph, scanHead } from './fixtures-scan-views';
import { at } from './render-at';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const api = {
  [`/api/scans/${SCAN}`]: scanHead,
  [`/api/scans/${SCAN}/graph`]: scanGraph,
};

describe('Scan page', () => {
  it('shows the summary, the tabs and where the scan stopped', async () => {
    at(`/app/scans/${SCAN}`, api);
    // the heading shows the short form; the summary writes the whole id out once, with Copy (Q6)
    expect(await screen.findByRole('heading', { level: 1, name: 'Scan 01a0da64-3bf1' })).toBeTruthy();
    expect(await screen.findByText(SCAN, { selector: '.sy-id--full' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Copy the full scan id ${SCAN}` })).toBeTruthy();
    expect(await screen.findByText('step budget reached', { selector: '.sy-callout' })).toBeTruthy();
    const tabs = screen.getByRole('navigation', { name: 'Scan sections' });
    expect(within(tabs).getByRole('link', { name: /Graph/ }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).getByRole('link', { name: /States/ }).getAttribute('href')).toBe(`/app/scans/${SCAN}/states`);
    expect(await screen.findByRole('heading', { name: 'Where it stopped' })).toBeTruthy();
    const path = screen.getByRole('list', { name: 'Path to where it stopped' });
    expect(within(path).getByText('✕ Dalej')).toBeTruthy();
    // opens on the screen it stopped on
    expect(screen.getByRole('heading', { name: 'Oferty' })).toBeTruthy();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Scans' }).getAttribute('href')).toBe('/app/portals/shop/scans');
  });

  it('retries a failed action with a variation after a confirm', async () => {
    const restart = `/api/scans/${SCAN}/restart`;
    const fetch = at(`/app/scans/${SCAN}`, {
      ...api,
      [restart]: { ok: true, message: 'Sent to the assistant.', href: '/chat?conversation=conv-1' },
    });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Variation for Dalej' }), { target: { value: 'wait_longer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry this path' }));
    const dialog = screen.getByRole('dialog', { name: 'Retry this path?' });
    expect(dialog.textContent).toContain('Wait longer');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry this path' }));
    expect(await screen.findByText('Sent to the assistant.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the conversation' }).getAttribute('href')).toBe('/chat?conversation=conv-1');
    const post = fetch.mock.calls.find((c) => c[0] === restart) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ run_type: 'retry', transition_id: 'e-bad', variation: 'wait_longer' });
  });

  it('resumes a stopped scan and picks another screen', async () => {
    at(`/app/scans/${SCAN}`, api);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('dialog', { name: 'Resume this scan?' }).textContent).toContain('guest in sandbox');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /^\/\s*Start/ }));
    expect(await screen.findByText('No action of this scan failed on this screen.')).toBeTruthy();
  });

  it('says so for an unknown scan', async () => {
    at('/app/scans/nope', {});
    expect(await screen.findByText('Could not load the scan')).toBeTruthy();
  });
});
