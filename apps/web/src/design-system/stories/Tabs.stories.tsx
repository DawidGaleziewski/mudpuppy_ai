import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Tabs } from '../index.js';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  args: {
    label: 'Screen parts',
    selected: 'states',
    onSelect: () => undefined,
    items: [
      { id: 'states', label: 'States', count: 17 },
      { id: 'forms', label: 'Forms', count: 2 },
      { id: 'calls', label: 'Calls' },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          'Tabs follow the WAI-ARIA tab pattern: arrow keys move, Home and End jump, only the selected tab is in the tab order. The caller holds the selection and renders the selected panel (`panelPrefix` ties the tabs to their panels).',
      },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: function Render(args) {
    const [tab, setTab] = useState(args.selected);
    return <Tabs {...args} selected={tab} onSelect={setTab} />;
  },
};
