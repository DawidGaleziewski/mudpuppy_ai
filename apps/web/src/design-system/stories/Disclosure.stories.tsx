import type { Meta, StoryObj } from '@storybook/react-vite';
import { Code, Disclosure, Stack } from '../index.js';

const SHAPE = JSON.stringify({ type: 'object', properties: { premium: { type: 'number' }, currency: { type: 'string' } } }, null, 2);

const meta = {
  title: 'Components/Disclosure',
  component: Disclosure,
  args: { summary: 'Response', children: <Code>{SHAPE}</Code> },
  parameters: {
    docs: {
      description: {
        component:
          'A summary that opens a body (`sy-disclosure`, a `details` element): a request or response shape, a decision\'s detail, kept out of the way of the table it sits in. `Code` (`sy-code`) shows preformatted text exactly as stored; long lines scroll inside it.',
      },
    },
  },
} satisfies Meta<typeof Disclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { args: { open: true } };
export const Shapes: Story = {
  render: () => (
    <Stack>
      <Disclosure summary="Request">
        <Code>{'{\n  "type": "object"\n}'}</Code>
      </Disclosure>
      <Disclosure summary="Response">
        <Code>{SHAPE}</Code>
      </Disclosure>
    </Stack>
  ),
};
