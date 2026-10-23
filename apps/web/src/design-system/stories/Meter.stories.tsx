import type { Meta, StoryObj } from '@storybook/react-vite';
import { Meter, Stack } from '../index.js';

const meta = {
  title: 'Components/Meter',
  component: Meter,
  args: { label: 'Scan 01a110d5', value: 171, max: 400, detail: '171 / 400 steps' },
  parameters: {
    docs: {
      description: {
        component:
          'Progress with its numbers: counts first (voice). The track is a progressbar for assistive technology; the status picks the paint (`running` cyan, `ok` green, `failed` red).',
      },
    },
  },
} satisfies Meta<typeof Meter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const States: Story = {
  render: () => (
    <Stack>
      <Meter label="Scan 01a110d5" value={171} max={400} detail="171 / 400 steps" />
      <Meter label="Scan 01a1083f" value={320} max={320} status="ok" />
      <Meter label="Scan 01a10421" value={12} max={400} status="failed" detail="stopped at step 12" />
    </Stack>
  ),
};
