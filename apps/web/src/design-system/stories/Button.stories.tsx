import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Cluster, LinkButton } from '../index.js';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Start the scan', variant: 'default' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'primary', 'strong', 'quiet', 'danger'] },
    size: { control: 'inline-radio', options: [undefined, 'md', 'sm'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'A button changes something; a link only navigates (use `LinkButton` for a link that is the view\'s main way on). **At most one `primary` per view** (rule 2: spray paint marks the one main action, never success). `strong`: the main action inside a card. `quiet`: secondary. `danger`: destructive, always behind a dialog. Labels in sentence case, ≤ 4–5 words; the CSS sets the caps. `busy` refuses clicks and announces the work.',
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Primary: Story = { args: { variant: 'primary' } };
export const Busy: Story = { args: { variant: 'primary', busy: true, children: 'Starting' } };
export const AllVariants: Story = {
  render: () => (
    <Cluster>
      <Button variant="primary">Start the scan</Button>
      <Button variant="strong">Confirm</Button>
      <Button>Plan a run</Button>
      <Button variant="quiet">Cancel</Button>
      <Button variant="danger">Delete portal</Button>
      <LinkButton href="#">Open Scans</LinkButton>
      <Button size="sm">Small</Button>
    </Cluster>
  ),
};
