import type { Meta, StoryObj } from '@storybook/react-vite';
import { Callout, Stack } from '../index.js';

const meta = {
  title: 'Components/Callout',
  component: Callout,
  args: { tone: 'intent', title: 'Open question', children: 'End of line never found. Resume the scan before sign-off.' },
  argTypes: { tone: { control: 'inline-radio', options: [undefined, 'intent', 'failure', 'ok', 'drawn'] } },
  parameters: {
    docs: {
      description: {
        component:
          'A message inside a view. Voice: counts first, then the next move. An error gives its reference, the next move and what still works; no emoji, no exclamation marks. `live` announces a message that arrives later (an alert for a failure).',
      },
    },
  },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenQuestion: Story = {};
export const Tones: Story = {
  render: () => (
    <Stack>
      <Callout tone="intent" title="Open question">
        End of line never found. Resume the scan before sign-off.
      </Callout>
      <Callout tone="failure" title="Assistant down">
        Reference ERR-4f2a. Restart it, then retry. Scans and Docs still work.
      </Callout>
      <Callout tone="ok">Exported 23 files.</Callout>
      <Callout tone="drawn" title="Proposal">
        Group these 4 screens as one process.
      </Callout>
    </Stack>
  ),
};
