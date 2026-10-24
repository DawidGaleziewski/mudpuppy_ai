import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button, Menu, SelectionBar, SortGrid } from '../index.js';

const screens = [
  { key: 'st-1', title: 'Kontakt', route: '/kontakt', meta: 'seen 17 Oct · 2 variants' },
  { key: 'st-2', title: 'Napisz do nas', route: '/kontakt/formularz', meta: 'seen 17 Oct · 1 variant' },
  { key: 'st-3', title: 'FAQ', route: '/faq', meta: 'seen 16 Oct · 1 variant' },
];

const entries = [
  { label: 'Processes · guest', group: true as const },
  { key: 'p1', label: 'Oblicz składkę OC/AC', note: 'guest · 6 steps', onSelect: () => undefined },
  { key: 'p2', label: 'Test process', note: 'guest · 2 steps', aside: 'already in', disabled: true },
  { separator: true as const },
  { key: 'new', label: 'New process from these…', onSelect: () => undefined },
];

function Live() {
  const [ticked, setTicked] = useState<string[]>(['st-2']);
  const tick = (key: string) => setTicked((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));
  return (
    <SortGrid
      label="Screens in no process"
      items={screens.map((s) => ({ ...s, src: null, ticked: ticked.includes(s.key), step: ticked.includes(s.key) ? ticked.indexOf(s.key) + 1 : null }))}
      onTick={tick}
      onOpen={() => undefined}
      menuFor={() => entries}>
      {ticked.length > 0 && (
        <SelectionBar count={`${String(ticked.length)} ticked`}>
          <Menu label="Add to process" button="Add to process ▾" entries={entries} align="up" />
          <Button size="sm" variant="quiet" onClick={() => setTicked([])}>
            Clear
          </Button>
        </SelectionBar>
      )}
    </SortGrid>
  );
}

const meta = {
  title: 'Components/SortGrid',
  component: SortGrid,
  parameters: {
    docs: {
      description: {
        component:
          'Sorting loose screens (designer T-05, D-69): tickable picture cards; a ticked card has a chalk edge and its step number in tick order (the order of a new process). X ticks a focused card, Shift + click ticks a range; the picture opens the dialog browsing the grid; Add to process ▾ on each card. `SelectionBar` sticks at the bottom while anything is ticked. No dragging: the menu does the same job for everyone.',
      },
    },
  },
} satisfies Meta<typeof SortGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InNoProcess: Story = {
  args: { label: 'Screens in no process', items: [], onTick: () => undefined, onOpen: () => undefined },
  render: () => <Live />,
};
