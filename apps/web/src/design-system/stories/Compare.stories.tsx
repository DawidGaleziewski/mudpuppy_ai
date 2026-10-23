import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, Compare, CompareSide, Status, Text } from '../index.js';

const meta = {
  title: 'Components/Compare',
  component: Compare,
  args: { children: null },
  parameters: {
    docs: {
      description: {
        component:
          'Things side by side: before and after, the variants of a screen. Each `CompareSide` is a section named by its head, with a chip at the right saying why it differs. The sides wrap under each other on a narrow screen.',
      },
    },
  },
} satisfies Meta<typeof Compare>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <Compare>
      <CompareSide title={<Text asIs>r1</Text>} aside={<Chip>Release</Chip>}>
        <Text small muted block>
          5696 · guest · 4 visits
        </Text>
        <Status status="ok">Observed</Status>
      </CompareSide>
      <CompareSide title={<Text asIs>r2</Text>} aside={<Chip variant="dashed">Unknown</Chip>}>
        <Text small muted block>
          guest · 1 visit
        </Text>
        <Status status="needs">Needs you</Status>
      </CompareSide>
    </Compare>
  ),
};
