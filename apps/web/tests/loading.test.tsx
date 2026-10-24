import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryState, useShownLoading } from '../src/app/QueryState';

afterEach(() => {
  vi.useRealTimers();
});

/** Move the fake clock on by `ms`, inside React's act. */
const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

// Designer T-10 (D-75, FE-V40, FE-V41): nothing under 300 ms; once shown, at least 300 ms.
describe('Loading without a blink', () => {
  it('shows no loading state for a load under 300 ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useShownLoading(loading), { initialProps: { loading: true } });
    wait(150);
    expect(result.current).toBe(false);
    rerender({ loading: false });
    wait(500);
    expect(result.current).toBe(false);
  });

  it('shows the skeleton from 300 ms and keeps it at least 300 ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useShownLoading(loading), { initialProps: { loading: true } });
    wait(300);
    expect(result.current).toBe(true);
    wait(50);
    rerender({ loading: false });
    wait(200);
    expect(result.current).toBe(true);
    wait(60);
    expect(result.current).toBe(false);
  });

  it('names what loads beside three beads, in a box of the page’s shape', () => {
    vi.useFakeTimers();
    render(
      <QueryState query={{ isLoading: true }} what="the screens">
        {() => null}
      </QueryState>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    wait(300);
    expect(screen.getByRole('status').textContent).toBe('Loading the screens');
    expect(document.querySelector('.sy-skel[aria-busy="true"] .sy-skel__rows')).toBeTruthy();
  });

  it('keeps the old rows, dimmed, while a new filter is read', () => {
    render(
      <QueryState query={{ data: ['a'], currentData: undefined, isLoading: false, isFetching: true }} what="the screens">
        {(d) => <p>{d.join()}</p>}
      </QueryState>,
    );
    expect(screen.getByText('a')).toBeTruthy();
    expect(document.querySelector('.sy-busy')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Updating');
  });
});
