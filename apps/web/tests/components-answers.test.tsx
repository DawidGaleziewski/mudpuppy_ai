// Designer round 3 (spec 072): the disabled segment (Q9) and the drawer's log that sticks to the end (Q8).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatLog, Drawer, Message, Segmented } from '../src/design-system/index.js';

describe('Segmented with a disabled segment (Q9)', () => {
  it('keeps it in the tab order with its reason, and pressing it does nothing', () => {
    const onSelect = vi.fn();
    render(
      <>
        <Segmented label="What the assistant can see" items={[{ value: 'page', label: 'This page', disabled: true, reason: 'why' }, { value: 'portal', label: 'Whole yard' }]} selected="portal" onSelect={onSelect} />
        <span id="why">Nothing on this page to ask about.</span>
      </>,
    );
    const page = screen.getByRole('button', { name: 'This page' });
    expect(page.getAttribute('aria-disabled')).toBe('true');
    expect(page.hasAttribute('disabled')).toBe(false);
    expect(page.getAttribute('aria-describedby')).toBe('why');
    fireEvent.click(page);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Whole yard' }));
    expect(onSelect).toHaveBeenCalledWith('portal');
  });
});

describe('The drawer and its log (Q8)', () => {
  it('has no height or stickiness of its own: the CSS gives them', () => {
    render(<Drawer title="Assistant">x</Drawer>);
    expect(screen.getByRole('complementary', { name: 'Assistant' }).getAttribute('style')).toBeNull();
  });

  it('offers "New messages ↓" when a message arrives while the person has scrolled up', () => {
    const log = (n: number) => (
      <ChatLog follow={n}>
        {Array.from({ length: n }, (_, i) => (
          <Message key={i}>{`m${String(i)}`}</Message>
        ))}
      </ChatLog>
    );
    const { rerender } = render(log(1));
    const el = screen.getByRole('log');
    // jsdom has no layout: pretend a tall log scrolled to the top
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 });
    el.scrollTop = 0;
    fireEvent.scroll(el);
    rerender(log(2));
    const more = screen.getByRole('button', { name: 'New messages ↓' });
    fireEvent.click(more);
    expect(el.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: 'New messages ↓' })).toBeNull();
  });
});
