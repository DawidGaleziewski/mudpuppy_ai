import type { Meta, StoryObj } from '@storybook/react-vite';
import { Picture } from '../index.js';

// A stand-in screenshot: a small SVG page, so the story needs no recorded evidence.
const shot = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#f4f1ea"/><rect x="40" y="40" width="600" height="48" fill="#2b2b2b"/><rect x="40" y="140" width="1200" height="20" fill="#bbb"/><rect x="40" y="180" width="900" height="20" fill="#bbb"/></svg>',
)}`;

const meta = {
  title: 'Components/Picture',
  component: Picture,
  args: {
    shot,
    title: 'Kalkulator OC/AC — dane pojazdu',
    route: '/kalkulator/pojazd',
    scans: 3,
    href: '#',
  },
  parameters: {
    docs: {
      description: {
        component:
          'A recorded screen: a thumbnail button (`.sy-thumb-btn`) whose corner badge says it opens larger ("Enlarge" on hover, focus and touch), and a wide dialog (`.sy-dialog--wide`, full screen under 640 px) with the large picture fitted to the width (it scrolls inside) or the whole page, a Screenshot / Wireframe switch, Previous / Next (← / →) through its set, a link to the full size and the way to the recorded page. It never ticks or selects anything. Without a picture it says so, and there is no button (design answers Q1, Q2).',
      },
    },
  },
} satisfies Meta<typeof Picture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithScreenshot: Story = {};
export const WireframeOnly: Story = { args: { shot: null, wire: shot } };
export const NoPicture: Story = { args: { shot: null, wire: null } };
/** In a row or a table cell (a list of screens): a 96 px thumbnail. */
export const Small: Story = { args: { size: 'sm' } };
/** One of a screen's variants: the dialog steps through the set with ← / → and Previous / Next. */
export const InASet: Story = {
  args: {
    alt: 'Variant r2 of Kalkulator OC/AC — dane pojazdu',
    set: {
      items: [
        { label: 'r1', shot },
        { label: 'r2', shot },
        { label: 'r3', wire: shot },
      ],
      at: 1,
    },
  },
};
