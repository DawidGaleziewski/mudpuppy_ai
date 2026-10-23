import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tag, Tags } from '../index.js';

const meta = {
  title: 'Components/Tag',
  component: Tag,
  args: { children: 'SCR-001', href: '#' },
  parameters: {
    docs: {
      description: {
        component:
          'Every record id shown as data is a tagged part (rule 1): SCR-, BR-, AMD-, H-, scan ids, revision labels, in their real case. A tag with `href` links to the record. `intent` (orange) only when the record needs a person. Not for ids inside text a person typed.',
      },
    },
  },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Linked: Story = {};
export const NeedsAPerson: Story = { args: { children: 'H-0004', intent: true } };
export const Row: Story = {
  render: () => (
    <Tags>
      <Tag href="#">SCR-001</Tag>
      <Tag href="#">AMD-001 r2</Tag>
      <Tag>01a110d5</Tag>
      <Tag size="sm">BR-021</Tag>
    </Tags>
  ),
};
