import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  Button,
  Field,
  Input,
  Meter,
  Note,
  PageHead,
  Plate,
  Status,
  Steps,
  Table,
  Tabs,
  Tag,
} from '../src/design-system/index.js';

describe('Button', () => {
  it('is a button by default, owns its class and refuses clicks while busy', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" busy onClick={onClick}>
        Start the scan
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Start the scan' });
    expect(b.getAttribute('type')).toBe('button');
    expect(b.className).toBe('sy-btn sy-btn--primary');
    expect(b.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Status', () => {
  it('shows a shape and a word: the default word, or the caller s', () => {
    const { container } = render(
      <>
        <Status status="needs" />
        <Status status="ok">21</Status>
      </>,
    );
    const [needs, ok] = container.querySelectorAll('.sy-status');
    expect(needs!.getAttribute('data-status')).toBe('needs');
    expect(needs!.textContent).toBe('Needs you');
    expect(ok!.textContent).toBe('21');
  });
});

describe('Tag and Note', () => {
  it('a tag with a target is a link; a note keeps its author apart', () => {
    render(
      <>
        <Tag href="/records/SCR-001">SCR-001</Tag>
        <Note by="Dawid">Driver data first.</Note>
      </>,
    );
    expect(screen.getByRole('link', { name: 'SCR-001' }).className).toBe('sy-tag');
    expect(screen.getByText('Dawid').className).toBe('sy-note__by');
  });
});

describe('Field', () => {
  it('ties the label, the help and the error to the control', () => {
    render(
      <Field label="Process name" help="Max 200 characters." error="A name is needed.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Process name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Max 200 characters.', 'A name is needed.']);
  });
});

describe('Tabs', () => {
  function Demo() {
    const [tab, setTab] = useState('states');
    return (
      <Tabs
        label="Screen parts"
        selected={tab}
        onSelect={setTab}
        items={[
          { id: 'states', label: 'States', count: 17 },
          { id: 'forms', label: 'Forms' },
          { id: 'calls', label: 'Calls' },
        ]}
      />
    );
  }

  it('moves with the arrow keys, wraps, and keeps only the selected tab in the tab order', () => {
    render(<Demo />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Calls');
    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'Home' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('States 17');
  });
});

describe('Meter', () => {
  it('exposes its value as a progressbar and its counts as text', () => {
    render(<Meter label="Scan 01a110d5" value={171} max={400} detail="171 / 400 steps" />);
    const bar = screen.getByRole('progressbar', { name: 'Scan 01a110d5' });
    expect(bar.getAttribute('aria-valuenow')).toBe('171');
    expect(screen.getByText('171 / 400 steps')).toBeTruthy();
  });
});

describe('Table', () => {
  it('has headers with scope and says when it is empty', () => {
    const columns = [
      { header: 'Screen', cell: (r: { id: string }) => r.id, rowHeader: true },
      { header: 'States', cell: () => 3, numeric: true },
    ];
    const { rerender } = render(
      <Table caption="Screens" columns={columns} rows={[{ id: '/kontakt' }]} rowKey={(r) => r.id} />,
    );
    expect(screen.getByRole('columnheader', { name: 'States' }).className).toBe('sy-num');
    expect(screen.getByRole('rowheader', { name: '/kontakt' })).toBeTruthy();
    // its sideways scroll on a phone is a named region a keyboard can reach
    expect(screen.getByRole('region', { name: 'Screens' }).tabIndex).toBe(0);
    rerender(<Table caption="Screens" columns={columns} rows={[]} rowKey={(r) => r.id} empty="No screens yet." />);
    expect(screen.getByText('No screens yet.')).toBeTruthy();
  });
});

describe('Steps, Plate, PageHead and AppShell', () => {
  it('mark the current step, name an untitled plate, keep one h1 and the current nav item', () => {
    render(
      <AppShell
        nav={[
          { items: [{ href: '/app/', label: 'Home', current: true }] },
          { label: 'Machine', items: [{ href: '/app/scans', label: 'Scans', count: 3 }] },
        ]}
      >
        <PageHead title="reference-insurer" meta="22 screens · 4 processes" />
        <Plate label="Workflow">
          <Steps
            label="Workflow"
            steps={[
              { label: '1 · Scan', status: 'ok' },
              { label: '2 · Narrow', status: 'needs', current: true },
            ]}
          />
        </Plate>
      </AppShell>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('region', { name: 'Workflow' })).toBeTruthy();
    expect(screen.getByText('2 · Narrow').closest('li')!.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
  });
});
