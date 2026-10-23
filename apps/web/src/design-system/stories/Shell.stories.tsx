import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell, Button, Grid, PageHead, Plate, Status } from '../index.js';

const meta = {
  title: 'Shell/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The console frame: skip link, the header with the wordmark, the portal sections as a grouped nav (2.0: Home, Changes, Review · Portal model · Machine), the main column. Counts in the nav are muted except where a person must act. One `h1` per page, in `PageHead`.',
      },
    },
  },
  args: {
    nav: [
      {
        items: [
          { href: '#', label: 'Home', current: true },
          { href: '#', label: 'Changes', count: 41 },
          { href: '#', label: 'Review', count: 24, needs: true },
        ],
      },
      {
        label: 'Portal model',
        items: [
          { href: '#', label: 'Processes' },
          { href: '#', label: 'Screens' },
          { href: '#', label: 'Rules' },
          { href: '#', label: 'Docs' },
        ],
      },
      {
        label: 'Machine',
        items: [
          { href: '#', label: 'Scans' },
          { href: '#', label: 'Settings' },
        ],
      },
    ],
    headerEnd: <Status status="ok">Assistant up</Status>,
    children: null,
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A portal's home page in the frame. */
export const PortalHome: Story = {
  render: (args) => (
    <AppShell {...args}>
      <PageHead
        crumbs={[{ label: 'Portals', href: '#' }, { label: 'reference-insurer' }]}
        title="reference-insurer"
        meta="22 screens · 4 processes · scanned 23 Oct"
        actions={<Button variant="primary">Start a scan</Button>}
      />
      <Grid min="18rem">
        <Plate title="Needs you" variant="intent">
          3 findings wait for a person.
        </Plate>
        <Plate title="Last scan">
          <Status status="ok" /> 49 steps, 22 screens.
        </Plate>
      </Grid>
    </AppShell>
  ),
};
