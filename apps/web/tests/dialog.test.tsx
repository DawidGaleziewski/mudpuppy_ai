// Spec 076 T021/T041: the compound Dialog that Confirm, RecordingDialog and Picture share. It opens
// and closes with `open`; Escape and the × call onClose; its parts render only while open, and a
// part outside a Dialog says where it belongs.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../src/design-system';

describe('Dialog', () => {
  it('opens with open, renders its parts only then, and closes on Escape and the ×', () => {
    const show = vi.fn();
    const close = vi.fn();
    HTMLDialogElement.prototype.showModal = show;
    const onClose = vi.fn();
    const parts = (open: boolean) => (
      <Dialog open={open} onClose={onClose} label="About">
        <Dialog.Head>
          <Dialog.Close />
        </Dialog.Head>
        <Dialog.Body>Body text</Dialog.Body>
      </Dialog>
    );
    const { container, rerender } = render(parts(false));
    expect(screen.queryByText('Body text')).toBeNull();
    rerender(parts(true));
    expect(show).toHaveBeenCalledOnce();
    expect(screen.getByText('Body text')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)', hidden: true }));
    fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
  });

  it('a part outside a Dialog says where it belongs', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Dialog.Foot>x</Dialog.Foot>)).toThrow('Dialog.Foot belongs inside a <Dialog>');
  });
});
