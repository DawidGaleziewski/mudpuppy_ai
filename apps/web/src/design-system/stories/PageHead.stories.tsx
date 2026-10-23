import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Columns, Grid, PageHead, Plate } from '../index.js';

const meta = {
  title: 'Components/PageHead',
  component: PageHead,
  args: {
    crumbs: [{ label: 'Processes', href: '#' }, { label: 'Oblicz składkę OC/AC' }],
    title: 'Oblicz składkę OC/AC',
    meta: '4 steps · 66 records · documented 23 Oct',
    actions: <Button variant="primary">Export</Button>,
  },
  parameters: {
    docs: {
      description: {
        component:
          '`PageHead`: the one `h1` of a page, its crumbs, a meta line (counts first) and its actions (at most one primary). Layout helpers: `Stack`, `Cluster`, `Split`, `Grid` (columns at least `min` wide), `Columns` (main and side).',
      },
    },
  },
} satisfies Meta<typeof PageHead>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Process: Story = {};
export const WithLayout: Story = {
  render: (args) => (
    <>
      <PageHead {...args} />
      <Columns
        main={
          <Grid min="16rem">
            <Plate title="Steps">4 steps, from dane pojazdu to Twoja składka.</Plate>
            <Plate title="Rules">19 business rules.</Plate>
          </Grid>
        }
        side={<Plate title="Open questions">OQ-001 to OQ-005.</Plate>}
      />
    </>
  ),
};
