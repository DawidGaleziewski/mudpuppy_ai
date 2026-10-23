import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, Cluster, Count } from '../index.js';

const meta = {
  title: 'Components/Chip',
  component: Chip,
  args: { children: 'beta', variant: 'dashed' },
  argTypes: { variant: { control: 'inline-radio', options: [undefined, 'fail', 'ok', 'tobe', 'dashed'] } },
  parameters: {
    docs: {
      description: {
        component:
          'A chip is a small mark beside a name ("beta", "Start here", "probe"). A `Count` sits beside a label or a nav item: muted by default, orange only where a person must act.',
      },
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Beta: Story = {};
export const All: Story = {
  render: () => (
    <Cluster>
      <Chip variant="dashed">beta</Chip>
      <Chip variant="ok">checked</Chip>
      <Chip variant="fail">broken</Chip>
      <Chip variant="tobe">to be</Chip>
      <Chip>Start here</Chip>
      <Count>24</Count>
      <Count muted>17</Count>
    </Cluster>
  ),
};
