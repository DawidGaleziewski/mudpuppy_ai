import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

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
    at('/app/portals/new', { '/api/portals/new': form(true) });
    const save = await screen.findByRole('button', { name: 'Save portal' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByLabelText('Address')[0] as HTMLElement, { target: { value: 'https://www.wikipedia.org/' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    expect(document.querySelector('dialog h2')?.textContent).toBe('Save the portal?');
  });

  it('says the assistant must run to save one', async () => {
    at('/app/portals/new', { '/api/portals/new': form(false) });
    expect(await screen.findByText('Assistant not running')).toBeTruthy();
    expect(screen.getByText('MUDPUPPY_ENV=local-dev pnpm --dir apps/chat start')).toBeTruthy();
  });
});
