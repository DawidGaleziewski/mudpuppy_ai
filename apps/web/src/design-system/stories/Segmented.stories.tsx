import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Segmented, type SegmentedProps } from '../index.js';

const meta = {
  title: 'Components/Segmented',
  component: Segmented,
  args: {
    label: 'Status',
    selected: 'active',
    onSelect: () => undefined,
    items: [
      { value: 'active', label: 'Active', count: 41 },
      { value: 'merged', label: 'Merged', count: 3 },
      { value: 'retired', label: 'Retired', count: 2 },
      { value: '', label: 'All', count: 46 },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          'One of a few values, every value visible: a status filter, Screenshot / Wireframe. Toggle buttons with `aria-pressed` in a named group; the pressed one is inverse. To switch between panels use `Tabs`, to pick from many values a `Select`.',
      },
    },
  },
} satisfies Meta<typeof Segmented>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live(args: SegmentedProps) {
  const [selected, setSelected] = useState(args.selected);
  return <Segmented {...args} selected={selected} onSelect={setSelected} />;
}

export const StatusFilter: Story = { render: (args) => <Live {...args} /> };

export const TwoViews: Story = {
  args: {
    label: 'Picture',
    selected: 'shot',
    items: [
      { value: 'shot', label: 'Screenshot' },
      { value: 'wire', label: 'Wireframe' },
    ],
  },
};
