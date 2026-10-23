// The components added for the scan-based views (spec 054): Confirm, Path, GraphNode's deck and marks.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Confirm, Graph, GraphNode, Path, Tag } from '../src/design-system';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('Confirm', () => {
  it('asks with the question as its name and one confirming button', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Confirm open title="Skip it?" confirmLabel="Skip it" onConfirm={onConfirm} onCancel={onCancel}>
        The next scans leave this action out.
      </Confirm>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Skip it?' });
    expect(dialog.textContent).toContain('The next scans leave this action out.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip it' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(dialog.querySelector('.sy-btn--primary')).toBeNull();
  });

  it('cancels on Escape, refuses a second click while busy, and closes', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <Confirm open busy title="Resume?" confirmLabel="Resume" onConfirm={vi.fn()} onCancel={onCancel}>
        A new scan starts.
      </Confirm>,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Resume' }).hasAttribute('disabled')).toBe(true);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
    rerender(
      <Confirm open={false} title="Resume?" confirmLabel="Resume" onConfirm={vi.fn()} onCancel={onCancel}>
        A new scan starts.
      </Confirm>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Path', () => {
  it('joins the steps, marks where it ends and the failed action', () => {
    const onSelect = vi.fn();
    render(
      <Path
        label="Path to where it stopped"
        steps={[
          { id: 'a', label: '/', onSelect },
          { id: 'b', label: '/oferty', here: true, onSelect },
          { id: 'x', label: '✕ Dalej', failed: true, onSelect },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Path to where it stopped' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByRole('button', { name: '/oferty' }).getAttribute('aria-current')).toBe('true');
    expect(within(list).queryByRole('button', { name: '✕ Dalej' })).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: '/' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('GraphNode', () => {
  it('draws a deck of states and the marks above the route', () => {
    render(
      <Graph label="Recorded map" width={200} height={100} edges={[]}>
        <GraphNode id="f" x={0} y={0} route="/wniosek" title="Wniosek" deck marks={<Tag size="sm">Probe</Tag>} />
      </Graph>,
    );
    const node = screen.getByRole('button', { name: /Wniosek/ });
    expect(node.className).toContain('sy-node--deck');
    expect(node.querySelector('.sy-node__marks')?.textContent).toBe('Probe');
  });
});
