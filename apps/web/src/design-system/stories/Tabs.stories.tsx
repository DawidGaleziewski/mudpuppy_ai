import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TabPanel, Tabs, ViewNav } from '../index.js';

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
          'Tabs follow the WAI-ARIA tab pattern: arrow keys move, Home and End jump, only the selected tab is in the tab order. The caller holds the selection and renders the selected panel in a `TabPanel` (`panelPrefix` ties the tabs to their panels). Views that are pages of their own (Screens: List, Map) are a `ViewNav`: links, the current one with `aria-current`.',
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

/** `ViewNav`: views that are pages of their own, as links that look like tabs. */
export const Views: Story = {
  render: () => (
    <ViewNav
      label="Screens views"
      items={[
        { href: '#list', label: 'List', count: 42 },
        { href: '#map', label: 'Map', current: true },
      ]}
    />
  ),
};

export const WithPanel: Story = {
  render: function Render(args) {
    const [tab, setTab] = useState(args.selected);
    return (
      <>
        <Tabs {...args} panelPrefix="demo" selected={tab} onSelect={setTab} />
        <TabPanel prefix="demo" id={tab}>
          The panel of the {tab} tab.
        </TabPanel>
      </>
    );
  },
};
