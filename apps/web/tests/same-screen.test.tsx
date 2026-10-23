import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const side = (label: string, state: string) => ({
  label, note: '', state_id: state, title: 'Kalkulator', route: '/kalkulator', shot: `/evidence/${state}.png`, wire: null,
  status: { shape: 'ok', word: 'Observed' }, scan: '01a16518-272d-7000-a376-65b105461ee2', at: '2026-10-22T19:30:57Z', has_change: false,
});
const answers = [['same', 'Same screen'], ['same_data', 'Same, different data'], ['different', 'Different screens']];
const pair = {
  a: { state: 'st-f1', screen_key: 'SC-0003', screen_title: 'Kalkulator' },
  b: { state: 'st-f1v', screen_key: 'SC-0003', screen_title: 'Kalkulator' },
  sides: [side('r1', 'st-f1'), side('r2', 'st-f1v')],
  similarity: 0.82,
  model_answer: 'same',
  label: { answer: 'different', by: 'Marek', at: '2026-10-20T10:00:00Z', reason: 'The error page is its own screen.' },
  conflict: true,
  differs: [{ label: 'Title', before: 'Kalkulator', after: 'Błąd' }],
  process: null,
  position: 1,
  total: 2,
  next_pair: ['st-a', 'st-ab'],
  earlier: [],
};
const body = (p: unknown) => ({ page: { portal: 'shop', screen: null, tau: 0.8, window: 0.05, answers, pair: p }, can_answer: true });

describe('Same screen?', () => {
  it('shows the conflict, both sides, three answers and the way on', async () => {
    at('/app/portals/shop/same-screen', { '/api/portals/shop/same-screen': body(pair) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Same screen?' })).toBeTruthy();
    expect(screen.getByText('A label and the model disagree')).toBeTruthy();
    expect(screen.getByText('1 of 2 · conflict')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Skip S' }).getAttribute('href')).toBe('/app/portals/shop/same-screen?a=st-a&b=st-ab');
    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    // the keys: 2 picks the second answer, Enter asks to save it
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Same, different data/ }).checked).toBe(true);
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(document.querySelector('dialog h2')?.textContent).toBe('Save "Same, different data"?');
  });

  it('says when nothing is left to compare', async () => {
    at('/app/portals/shop/same-screen', { '/api/portals/shop/same-screen': body(null) });
    expect(await screen.findByText('Nothing to compare')).toBeTruthy();
  });
});
