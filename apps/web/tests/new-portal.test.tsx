import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at, confirmIn } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const form = (up: boolean) => ({
  service_up: up,
  start_hint: 'MUDPUPPY_ENV=local-dev pnpm --dir apps/chat start',
  environments: ['production', 'staging', 'sandbox'],
  limits: [{ value: 'external-side-effect', label: 'fill and submit forms (everything)' }, { value: 'read', label: 'only look, never submit' }],
});

describe('New portal', () => {
  it('saves only once an address is given, after asking', async () => {
    const fetch = at('/app/portals/new', { '/api/portals/new': form(true), 'POST /api/portals': { ok: true, message: 'Saved.', href: null } });
    const save = await screen.findByRole('button', { name: 'Save portal' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByLabelText('Address')[0] as HTMLElement, { target: { value: 'https://www.wikipedia.org/' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('respect it'));
    fireEvent.click(save);
    await confirmIn('Save the portal?', 'Save portal');
    const posted = () => fetch.mock.calls.find((c) => c[0] === '/api/portals' && c[1]?.method === 'POST');
    await waitFor(() => expect(posted()).toBeTruthy());
    const post = posted() as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ id: '', robots: 'respect', environments: { production: { base_url: 'https://www.wikipedia.org/', limit: 'external-side-effect' } } });
  });

  it('says the assistant must run to save one', async () => {
    at('/app/portals/new', { '/api/portals/new': form(false) });
    expect(await screen.findByText('Assistant not running')).toBeTruthy();
    expect(screen.getByText('MUDPUPPY_ENV=local-dev pnpm --dir apps/chat start')).toBeTruthy();
  });
});
