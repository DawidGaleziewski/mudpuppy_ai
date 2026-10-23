import type { Meta, StoryObj } from '@storybook/react-vite';
import { Count, Row, Rows, Status, Tag } from '../index.js';

const meta = {
  title: 'Components/Rows',
  component: Rows,
  args: { label: 'Last scans', children: null },
  parameters: {
    docs: {
      description: {
        component:
          'A list of rows (scans, records, questions), usually flush in a `Plate`. Each `Row` has its main content and an `aside` (a status, a count, a quiet button). `current` marks the thing shown now; `tone`: `intent` needs a person, `muted` is retired or skipped, `dashed` is queued or not observed.',
      },
    },
  },
} satisfies Meta<typeof Rows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scans: Story = {
  render: (args) => (
    <Rows {...args}>
      <Row current aside={<Status status="running">171 / 400</Status>}>
        <Tag>01a110d5</Tag> guest · map
      </Row>
      <Row tone="intent" aside={<Count>3</Count>}>
        <Tag>01a1083f</Tag> 3 findings need you
      </Row>
      <Row tone="dashed" aside={<Status status="queued" />}>
        /moje-polisy/przedluz
      </Row>
      <Row tone="muted" aside={<Status status="stopped" />}>
        <Tag>01a10421</Tag> klient · trace
      </Row>
    </Rows>
  ),
};
