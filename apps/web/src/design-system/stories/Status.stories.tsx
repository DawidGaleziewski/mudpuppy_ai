import type { Meta, StoryObj } from '@storybook/react-vite';
import { Cluster, Status, STATUSES } from '../index.js';

const meta = {
  title: 'Components/Status',
  component: Status,
  args: { status: 'needs' },
  argTypes: { status: { control: 'select', options: [...STATUSES] } },
  parameters: {
    docs: {
      description: {
        component:
          'Every status is a shape and a word, never a colour alone (rule 8). Map any value of the product through the one status vocabulary (`STATUSES`, from the designer\'s status map): `ok` filled green, `running` cyan pulse, `needs` orange (a person must act), `draft`/`inferred` dashed blue, `failed` a red cross, `overturned` manila with the person\'s reason beside it.',
      },
    },
  },
} satisfies Meta<typeof Status>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsYou: Story = {};
export const WithItsOwnWord: Story = { args: { status: 'ok', children: '21' } };
export const Every: Story = {
  render: () => (
    <Cluster>
      {STATUSES.map((s) => (
        <Status key={s} status={s} />
      ))}
    </Cluster>
  ),
};
