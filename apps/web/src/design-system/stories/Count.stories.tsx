import type { Meta, StoryObj } from '@storybook/react-vite';
import { Cluster, Count } from '../index.js';

const meta = {
  title: 'Components/Count',
  component: Count,
  args: { children: 24 },
  parameters: {
    docs: {
      description: {
        component:
          'A count beside a label, a tab or a nav item. Muted by default; orange (not muted) only where a person must act (rule 2), such as Review\'s "needs you" count.',
      },
    },
  },
} satisfies Meta<typeof Count>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsYou: Story = {};
export const Muted: Story = { args: { muted: true, children: 17 } };
export const Both: Story = {
  render: () => (
    <Cluster>
      <Count>24</Count>
      <Count muted>17</Count>
    </Cluster>
  ),
};
