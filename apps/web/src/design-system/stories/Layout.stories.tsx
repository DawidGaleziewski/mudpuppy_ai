import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Cluster, Columns, Grid, Plate, Split, Stack, Text } from '../index.js';

const meta = {
  title: 'Components/Layout',
  component: Stack,
  args: { children: null },
  parameters: {
    docs: {
      description: {
        component:
          'Pages lay out through these, never with their own CSS. `Stack`: one under the other with the system gap. `Cluster`: a wrapping row (buttons, tags). `Split`: two ends of a line. `Grid`: equal columns at least `min` wide. `Columns`: a main and a side column (detail pages).',
      },
    },
  },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StackAndCluster: Story = {
  render: () => (
    <Stack>
      <Split>
        <Text>22 screens · 4 processes</Text>
        <Button variant="quiet">Refresh</Button>
      </Split>
      <Cluster>
        <Button>Plan a run</Button>
        <Button variant="quiet">Cancel</Button>
      </Cluster>
    </Stack>
  ),
};

export const GridAndColumns: Story = {
  render: () => (
    <Columns
      main={
        <Grid min="14rem">
          <Plate title="Steps">4 steps.</Plate>
          <Plate title="Rules">19 rules.</Plate>
          <Plate title="Data">17 data items.</Plate>
        </Grid>
      }
      side={<Plate title="Open questions">OQ-001 to OQ-005.</Plate>}
    />
  ),
};
