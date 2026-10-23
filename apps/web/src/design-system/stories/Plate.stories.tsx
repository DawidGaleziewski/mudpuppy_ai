import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Plate, Row, Rows, Status, Tag } from '../index.js';

const meta = {
  title: 'Components/Plate',
  component: Plate,
  args: { title: 'Scans', children: 'Plate content.' },
  argTypes: { variant: { control: 'inline-radio', options: [undefined, 'intent', 'failure', 'drawn'] } },
  parameters: {
    docs: {
      description: {
        component:
          'Every block of content sits in a solid plate on the grid ground (rule 5). `intent`: the one plate of a view that needs a person (at most one per view). `failure`: what failed. `drawn`: the to-be, dashed blueprint (rule 3). Square, no shadows (rule 6). `flush` puts a list or a table edge to edge; an untitled plate needs a `label`.',
      },
    },
  },
} satisfies Meta<typeof Plate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NeedsYou: Story = {
  args: {
    variant: 'intent',
    title: 'Needs you',
    children: '3 findings wait for a person. Open Review.',
    foot: <Button variant="strong">Open Review</Button>,
  },
};
export const Drawn: Story = { args: { variant: 'drawn', title: 'Proposed process', children: '4 screens, from dane pojazdu to Twoja składka.' } };

/** Rows of a list, edge to edge: the current one marked, retired ones muted. */
export const WithRows: Story = {
  args: { title: 'Last scans', flush: true },
  render: (args) => (
    <Plate {...args}>
      <Rows label="Last scans">
        <Row current aside={<Status status="running">171 / 400</Status>}>
          <Tag>01a110d5</Tag> guest · map
        </Row>
        <Row aside={<Status status="ok" />}>
          <Tag>01a1083f</Tag> guest · map
        </Row>
        <Row tone="muted" aside={<Status status="stopped" />}>
          <Tag>01a10421</Tag> klient · trace
        </Row>
      </Rows>
    </Plate>
  ),
};
