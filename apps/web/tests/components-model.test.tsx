// The components added for the portal model's pages (spec 052): Segmented, Timeline, Compare,
// Picture, TabPanel, Text's route and as-is faces, Meter's own name.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Compare,
  CompareSide,
  Meter,
  Picture,
  Segmented,
  TabPanel,
  Text,
  Timeline,
  TimelineItem,
} from '../src/design-system';

describe('Segmented', () => {
  it('is a named group of toggle buttons with the selected one pressed', () => {
    const onSelect = vi.fn();
    render(
      <Segmented
        label="Status"
        selected="active"
        onSelect={onSelect}
        items={[
          { value: 'active', label: 'Active', count: 4 },
          { value: '', label: 'All', count: 6 },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Status' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Active 4' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'All 6' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });
});

describe('Timeline, Compare and TabPanel', () => {
  it('a timeline is a named list with a marker per item; a compare side is named by its head', () => {
    render(
      <>
        <Timeline label="History">
          <TimelineItem status="draft" head="New element">
            A button
          </TimelineItem>
        </Timeline>
        <Compare>
          <CompareSide title="r2">Persona premium</CompareSide>
        </Compare>
        <TabPanel prefix="screen" id="actions">
          panel
        </TabPanel>
      </>,
    );
    const item = screen.getByRole('list', { name: 'History' }).querySelector('li')!;
    expect(item.getAttribute('data-status')).toBe('draft');
    expect(screen.getByRole('region', { name: 'r2' }).textContent).toContain('Persona premium');
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('screen-actions');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-actions');
  });
});

describe('Picture', () => {
  it('opens the large picture in a dialog and switches to the wireframe', () => {
    const showModal = vi.fn();
    HTMLDialogElement.prototype.showModal = showModal;
    render(<Picture shot="/evidence/s.png" wire="/evidence/w.svg" title="Kontakt" route="/kontakt" scans={2} href="/x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Picture of Kontakt' }));
    expect(showModal).toHaveBeenCalled();
    const large = () => screen.getAllByRole('img', { hidden: true }).find((i) => i.getAttribute('alt'))!;
    expect(large().getAttribute('src')).toBe('/evidence/s.png');
    fireEvent.click(screen.getByRole('button', { name: 'Wireframe', hidden: true }));
    expect(large().getAttribute('src')).toBe('/evidence/w.svg');
  });

  it('says so when nothing was recorded', () => {
    render(<Picture title="Kontakt" />);
    expect(screen.getByText('No picture was recorded.')).toBeTruthy();
  });
});

describe('Text and Meter', () => {
  it('a route and an as-is value own their faces; a meter can carry its own name', () => {
    render(
      <>
        <Text route>/kontakt</Text>
        <Text asIs>Kalkulator OC/AC</Text>
        <Meter label="Actions" srLabel="Actions checked on Kontakt" value={3} max={4} />
      </>,
    );
    expect(screen.getByText('/kontakt').className).toBe('sy-route');
    expect(screen.getByText('Kalkulator OC/AC').className).toBe('sy-case-normal');
    expect(screen.getByRole('progressbar', { name: 'Actions checked on Kontakt' })).toBeTruthy();
  });
});
