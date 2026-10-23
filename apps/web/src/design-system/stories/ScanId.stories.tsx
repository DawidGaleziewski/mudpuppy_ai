import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScanId } from '../index.js';

const ID = '01a110d5-2028-7000-8f3e-5c1a9b27d460';

const meta = {
  title: 'Components/ScanId',
  component: ScanId,
  args: { id: ID },
  parameters: {
    docs: {
      description: {
        component:
          'A scan id (D-9, design answer Q6). Data, links, API calls and exports keep the full UUIDv7; people see the 13-character short form, the first two groups (the start time in milliseconds), with the full id on hover. When two ids in the same list share the short form (`siblings`), both show one more group. A link or an id shown as data is a manila tag; Copy goes where the id is a fact people act on (a scan header, a scan row); `full` writes the whole id out, on the scan\'s own page only. Never the 8-character form.',
      },
    },
  },
} satisfies Meta<typeof ScanId>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Linked: Story = { args: { href: '#scan' } };
export const WithCopy: Story = { args: { href: '#scan', copy: true } };
/** Two scans of the same millisecond: the third group tells them apart. */
export const SameMillisecond: Story = { args: { href: '#scan', siblings: [ID, '01a110d5-2028-7001-8f3e-5c1a9b27d461'] } };
/** The scan's own page. */
export const Full: Story = { args: { full: true, copy: true } };
