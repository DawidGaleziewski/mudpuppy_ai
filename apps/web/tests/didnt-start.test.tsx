import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandCard, GenView } from '../src/design-system';

// Designer T-13 (D-78, FE-V44): a command that failed before it created anything.
describe("A start that didn't start", () => {
  it('says what was created, quotes why, and offers Start again and the address', () => {
    const again = vi.fn();
    render(
      <CommandCard
        title="Start a map scan"
        state="failed"
        status={{ status: 'failed', children: 'Failed' }}
        error="robots.txt could not be read (network error: fetch failed)."
        errorRef="ERR-T"
        notStarted={{ onAgain: again, check: '/app/portals/shop/settings' }}
      />,
    );
    expect(screen.getByText("Didn't start")).toBeTruthy();
    expect(screen.queryByText('Failed')).toBeNull();
    expect(screen.getByText('nothing: no scan, no pages, nothing in Scans')).toBeTruthy();
    expect(screen.getByText('“robots.txt could not be read (network error: fetch failed).”')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Check the address' }).getAttribute('href')).toBe('/app/portals/shop/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(again).toHaveBeenCalled();
  });

  it('places the live map without the generated mark when the server put it there', () => {
    render(
      <GenView id="live" title="Live map" source="Live · placed by the server when the scan started" card placed>
        map
      </GenView>,
    );
    expect(screen.getByRole('heading', { name: 'Live map' })).toBeTruthy();
    expect(screen.queryByText('generated')).toBeNull();
  });
});
