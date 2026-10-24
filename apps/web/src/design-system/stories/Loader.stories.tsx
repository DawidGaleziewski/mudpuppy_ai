import type { Meta, StoryObj } from '@storybook/react-vite';
import { Busy, Loader, Reserve, Skeleton, Table } from '../index.js';

const meta = {
  title: 'Components/Loader',
  component: Loader,
  args: { children: 'Loading screens · 12 of 23' },
  parameters: {
    docs: {
      description: {
        component:
          'The loader (designer T-10, D-74): three weld beads, the running pulse in turn, and **what** is loading, with a count when there is one. Never "Please wait", never a spinner. `size="sm"` in toolbars and table heads ("Updating"), `size="block"` centred in a `Reserve` that already has its final size. A page body loads as a `Skeleton` at its final size, shown only after 300 ms and for at least 300 ms (`QueryState`); a list read again keeps its rows, dimmed (`Busy`). Not for a button at work (`busy`) or the assistant composing (its blueprint skeleton).',
      },
    },
  },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm', children: 'Updating' } };

/** A graph's box at its final height with the block loader (FE-V45: nothing moves when it lands). */
export const InAReservedBox: Story = {
  render: () => (
    <Reserve height={320}>
      <Loader size="block">Laying out 19 screens</Loader>
    </Reserve>
  ),
};

/** A list's body while it loads: the filter row and eight rows of the final row height. */
export const PageSkeleton: Story = {
  render: () => (
    <Skeleton label="Loading screens">
      <Skeleton.Line width="40%" />
      <Skeleton.Block height={56} />
      <Skeleton.Rows rows={8} rowHeight={61} />
    </Skeleton>
  ),
};

/** A list read again with a new filter: the old rows stay, dimmed, "Updating" out of the flow. */
export const Refetching: Story = {
  render: () => (
    <Busy busy>
      <Table caption="Screens" columns={[{ header: 'Screen', cell: (r: { t: string }) => r.t }]} rows={[{ t: 'Kontakt' }, { t: 'Kalkulator' }]} rowKey={(r) => r.t} />
    </Busy>
  ),
};
