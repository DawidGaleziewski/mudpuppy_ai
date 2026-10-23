import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, DecisionTable, Tag, Text } from '../index.js';

const meta = {
  title: 'Components/DecisionTable',
  component: DecisionTable,
  args: {
    label: 'BR-021 decision table',
    inputs: ['Wiek kierowcy'],
    result: '→ Next screen',
    facts: [
      ['Inputs', <Text key="i" mono small>Wiek kierowcy</Text>],
      ['Hit policy', 'First match: rows are checked top to bottom.'],
    ],
    rows: [
      {
        conditions: ['< 21'],
        result: (
          <>
            <Tag size="sm">SC-0014</Tag> <Chip>refused</Chip>
          </>
        ),
      },
      { conditions: ['>= 21'], result: <Tag size="sm">SC-0006</Tag> },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          'A business rule as a decision table (designer v2-12, `.sy-table--decision`): the inputs on the left, a double weld, the result on the right; one rule per numbered row. A condition is mono; a row that takes any value of an input says "any", muted. Facts above the table say the inputs, the hit policy and where it is decided. It scrolls sideways in its own region on a narrow screen.',
      },
    },
  },
} satisfies Meta<typeof DecisionTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneInput: Story = {};
/** Two inputs; a row that does not look at one of them says "any". */
export const TwoInputs: Story = {
  args: {
    inputs: ['Wiek kierowcy', 'Rodzaj pojazdu'],
    rows: [
      { conditions: ['< 21', null], result: <Tag size="sm">SC-0014</Tag> },
      { conditions: ['>= 21', 'motocykl'], result: <Tag size="sm">SC-0015</Tag> },
      { conditions: ['>= 21', null], result: <Tag size="sm">SC-0006</Tag> },
    ],
  },
};
