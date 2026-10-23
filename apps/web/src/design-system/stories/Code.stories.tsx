import type { Meta, StoryObj } from '@storybook/react-vite';
import { Code } from '../index.js';

const meta = {
  title: 'Components/Code',
  component: Code,
  args: { children: JSON.stringify({ type: 'object', properties: { premium: { type: 'number' } } }, null, 2) },
  parameters: {
    docs: {
      description: {
        component:
          'Preformatted text exactly as stored (`sy-code`): a request or response shape, a config snapshot. Long lines scroll inside it instead of widening the page.',
      },
    },
  },
} satisfies Meta<typeof Code>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shape: Story = {};
export const LongLine: Story = { args: { children: `GET ${'/very/long/path'.repeat(20)}` } };
