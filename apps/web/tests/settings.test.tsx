// Settings (spec 068) over a stubbed API: every part, the chat service stopped, and the writes
// (save and revoke an environment, the hints, the budgets, accept τ) asked first.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at, confirmIn } from './render-at';


afterEach(() => {
  vi.unstubAllGlobals();
});

const API = '/api/portals/shop';
const env = (name: string) => ({ name, base_url: `https://${name}.example.test`, limit: 'read', limit_word: 'only look, never submit', robots: 'respect it', can_revoke: true });
const page = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  service_up: true,
  start_hint: null,
  error: null,
  environments: [env('production'), env('staging')],
  missing: ['sandbox'],
  limits: [
    { value: 'external-side-effect', label: 'fill and submit forms (everything)' },
    { value: 'read', label: 'only look, never submit' },
  ],
  not_configured: { shape: 'todo', word: 'Not configured' },
  credentials: [{ value: 'SHOP_LOGIN', label: 'staging · 2026-09-25T19:00:00Z' }],
  workbench: '3 of 40 turns used today. The count starts again at 00:00Z.',
  personas: [{ id: 'client', kind: 'logged-in', refs: ['SHOP_LOGIN'], attributes: [{ value: 'tariff', label: 'premium' }] }],
  sign_ins: ['SHOP'],
  rules: { robots: 'respect', domains: ['shop.example.pl'], allowed_urls: null, disallowed_urls: ['/admin/*'] },
  hints: { release_marker: null, ab_flags: [], refusals: [], marker_header: '', marker_meta: '', checks_per_scan: 20, probes_per_step: 24, probes_per_scan: 120 },
  identity: { profile: 'v2', tau: null, same_labels: 1, distinct_labels: 2, classifier: null, can_accept_classifier: false },
  store: { environment: 'sandbox', path: '/data/db/sandbox.sqlite', exists: true, size_kb: 2048 },
  reviewer: true,
  ...over,
});
const bodyOf = (fetch: ReturnType<typeof at>, path: string) => {
  const call = fetch.mock.calls.find((c) => c[0] === path) as unknown as [string, { body: string }];
  return JSON.parse(call[1].body) as Record<string, unknown>;
};
// a form's submit validates first (React Hook Form), so the confirm opens a moment later

describe('Settings', () => {
  it('shows every part, credentials by name only', async () => {
    at('/app/portals/shop/settings', { [`${API}/settings`]: page() });
    expect(await screen.findByRole('region', { name: 'Environments of shop' })).toBeTruthy();
    expect(screen.getByText('Not configured')).toBeTruthy();
    expect(screen.getByText('SHOP_LOGIN', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('3 of 40 turns used today. The count starts again at 00:00Z.')).toBeTruthy();
    expect(screen.getByText('shop.example.pl')).toBeTruthy();
    expect(screen.getByText('1 same screen · 2 different screens')).toBeTruthy();
    expect(screen.getByText('/data/db/sandbox.sqlite')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });

  it('says how to start the chat service when it does not answer', async () => {
    at('/app/portals/shop/settings', { [`${API}/settings`]: page({ service_up: false, start_hint: 'MUDPUPPY_ENV=sandbox pnpm --dir apps/chat start', environments: [], missing: ['production', 'staging', 'sandbox'] }) });
    expect(await screen.findByText('Assistant not running')).toBeTruthy();
    expect(screen.getByText('MUDPUPPY_ENV=sandbox pnpm --dir apps/chat start')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save environment' }).hasAttribute('disabled')).toBe(true);
  });

  it('saves an environment after asking', async () => {
    const fetch = at('/app/portals/shop/settings', { [`${API}/settings`]: page(), [`POST ${API}/environments`]: { ok: true, message: 'sandbox saved.', href: null } });
    fireEvent.change(await screen.findByLabelText('Address'), { target: { value: 'https://sandbox.example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save environment' }));
    await confirmIn('Save sandbox?', 'Save environment');
    expect(await screen.findByText('sandbox saved.')).toBeTruthy();
    expect(bodyOf(fetch, `${API}/environments`)).toEqual({ environment: 'sandbox', base_url: 'https://sandbox.example.test', limit: 'external-side-effect' });
  });

  it('revokes an environment after asking', async () => {
    const fetch = at('/app/portals/shop/settings', { [`${API}/settings`]: page(), [`POST ${API}/environments/staging/revoke`]: { ok: true, message: 'staging revoked.', href: null } });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke staging' }));
    await confirmIn('Revoke staging?', 'Revoke staging');
    expect(await screen.findByText('staging revoked.')).toBeTruthy();
    expect(fetch.mock.calls.some((c) => c[0] === `${API}/environments/staging/revoke`)).toBe(true);
  });

  it('saves the budgets and accepts τ after asking', async () => {
    const fetch = at('/app/portals/shop/settings', {
      [`${API}/settings`]: page(),
      [`POST ${API}/hints/budgets`]: { ok: true, message: 'Budgets saved.', href: null },
      [`POST ${API}/model/accept`]: { ok: true, message: 'The calibrated τ is in force from the next rebuild.', href: null },
    });
    fireEvent.change(await screen.findByLabelText('Checks per scan'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the budgets' }));
    await confirmIn('Save the budgets?', 'Save the budgets');
    expect(await screen.findByText('Budgets saved.')).toBeTruthy();
    expect(bodyOf(fetch, `${API}/hints/budgets`)).toEqual({ checks_per_scan: '5', probes_per_step: '24', probes_per_scan: '120' });
    expect(screen.getByRole('button', { name: 'Accept the classifier' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Accept the calibrated τ' }));
    await confirmIn('Accept the calibrated τ?', 'Accept the calibrated τ');
    expect(await screen.findByText('The calibrated τ is in force from the next rebuild.')).toBeTruthy();
  });
});

describe('Settings ▸ Personas (spec 072, designer 19/04)', () => {
  it('adds a persona after asking: a sign-in by name, test data as rows; a taken name is said first', async () => {
    const fetch = at('/app/portals/shop/settings', {
      [`${API}/settings`]: page(),
      [`POST ${API}/personas`]: { ok: true, message: 'Persona reader added to shop.', href: null },
    });
    const name = await screen.findByLabelText('Name');
    fireEvent.change(name, { target: { value: 'client' } });
    // the form checks as it is typed, asynchronously (React Hook Form + zod)
    expect(await screen.findByText('client is already a persona of this portal.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add persona' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(name, { target: { value: 'reader' } });
    fireEvent.change(screen.getByLabelText('Signs in with'), { target: { value: 'SHOP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a value' }));
    fireEvent.change(screen.getByLabelText('Field 1'), { target: { value: 'Kod pocztowy' } });
    fireEvent.change(screen.getByLabelText('Value for Kod pocztowy'), { target: { value: '00-950' } });
    const add = screen.getByRole('button', { name: 'Add persona' });
    await waitFor(() => expect(add.hasAttribute('disabled')).toBe(false));
    fireEvent.click(add);
    await confirmIn('Add persona reader?', 'Add persona');
    expect(await screen.findByText('Persona reader added to shop.')).toBeTruthy();
    expect(bodyOf(fetch, `${API}/personas`)).toEqual({ name: 'reader', credential: 'SHOP', test_data: [{ field: { label: 'Kod pocztowy' }, value: '00-950' }] });
  });

  it('removes a persona after asking', async () => {
    const fetch = at('/app/portals/shop/settings', {
      [`${API}/settings`]: page(),
      [`POST ${API}/personas/client/remove`]: { ok: false, message: 'Not done: a scan already used persona "client", so it stays.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove client' }));
    await confirmIn('Remove persona client?', 'Remove');
    expect(await screen.findByText(/so it stays/)).toBeTruthy();
    expect(fetch.mock.calls.some((c) => c[0] === `${API}/personas/client/remove`)).toBe(true);
  });
});
