// Scan ids on screen (D-9, design answer Q6): the short form, its widening, the tag and Copy.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanId, shortScanId } from '../src/design-system';

const ID = '01a110d5-2028-7000-8f3e-5c1a9b27d460';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shortScanId', () => {
  it('is the first two groups, one more group at a time while another id starts the same', () => {
    expect(shortScanId(ID)).toBe('01a110d5-2028');
    expect(shortScanId(ID, [ID, '01a110d5-2029-7000-8f3e-5c1a9b27d460'])).toBe('01a110d5-2028');
    expect(shortScanId(ID, ['01a110d5-2028-7001-8f3e-5c1a9b27d460'])).toBe('01a110d5-2028-7000');
    expect(shortScanId(ID, ['01a110d5-2028-7000-9f3e-5c1a9b27d460'])).toBe('01a110d5-2028-7000-8f3e');
    expect(shortScanId(ID, ['01a110d5-2028-7000-8f3e-000000000000'])).toBe(ID);
    expect(shortScanId('run-1')).toBe('run-1'); // not a UUID: as it is
  });
});

describe('ScanId', () => {
  it('a link is a manila tag with the short form and the whole id on hover', () => {
    render(<ScanId id={ID} href={`/app/scans/${ID}`} />);
    const link = screen.getByRole('link', { name: '01a110d5-2028' });
    expect(link.className).toBe('sy-tag sy-tag--sm');
    expect(link.getAttribute('title')).toBe(ID);
    expect(link.getAttribute('href')).toBe(`/app/scans/${ID}`);
  });

  it('writes the whole id out on the scan page and copies it', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<ScanId id={ID} full copy />);
    expect(screen.getByText(ID).className).toBe('sy-id sy-id--full');
    const copy = screen.getByRole('button', { name: `Copy the full scan id ${ID}` });
    await act(async () => {
      fireEvent.click(copy);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(ID);
    expect(copy.textContent).toBe('Copied');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(copy.textContent).toBe('Copy');
    vi.useRealTimers();
  });
});
