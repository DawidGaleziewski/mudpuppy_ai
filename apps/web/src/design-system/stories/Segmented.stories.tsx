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
          'One of a few values, every value visible: a status filter, Screenshot / Wireframe. Toggle buttons with `aria-pressed` in a named group; the pressed one is inverse. To switch between panels use `Tabs`, to pick from many values a `Select`. A segment that does not apply here is `disabled` with a `reason` (the id of a line under the control): `aria-disabled`, still in the tab order, pressing it does nothing (designer Q9).',
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

/** A segment that does not apply here (designer Q9): shown disabled with its reason, never hidden. */
export const DisabledWithReason: Story = {
  args: {
    label: 'What the assistant can see',
    selected: 'portal',
    items: [
      { value: 'page', label: 'This page', disabled: true, reason: 'seg-why' },
      { value: 'portal', label: 'Whole yard' },
    ],
  },
  render: (args) => (
    <div>
      <Segmented {...args} />
      <p id="seg-why" className="sy-small sy-muted">
        Nothing on this page to ask about. Open a screen, process or rule to use This page.
      </p>
    </div>
  ),
};

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
