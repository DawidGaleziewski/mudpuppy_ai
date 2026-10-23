import type { Meta, StoryObj } from '@storybook/react-vite';
import { Compare, CompareSide, Shot } from '../index.js';

// Stand-in pages: small SVGs, so the story needs no recorded evidence. The after page has a button.
const page = (button: boolean) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="#f4f1ea"/><rect x="40" y="20" width="500" height="20" fill="#2b2b2b"/><rect x="40" y="120" width="900" height="16" fill="#bbb"/>${button ? '<rect x="100" y="50" width="200" height="25" fill="#1d4ed8"/>' : ''}</svg>`,
  )}`;
const region = { left: 10, top: 10, width: 20, height: 5 };

const meta = {
  title: 'Components/Shot',
  component: Shot,
  args: { src: page(true), alt: 'After: Start', region, mark: 'here' },
  parameters: {
    docs: {
      description: {
        component:
          'A recorded page at full width for Before / after (designer v2-03, 12-v2-ux § 6). `mark="here"` outlines the changed region with "Changed" (`.sy-mark--overlay`, the system pointing); `mark="gone"` draws a dashed empty box at the same place on the side without it, "Not here". `over` draws a second page over it at 50 % (Overlay mode, for small shifts), with no mark. The dashed box has no designer class yet (F-01@064).',
      },
    },
  },
} satisfies Meta<typeof Shot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Changed: Story = {};
export const NotHere: Story = { args: { src: page(false), alt: 'Before: Start', mark: 'gone' } };
export const Overlay: Story = { args: { src: page(false), alt: 'Before', region: null, over: { src: page(true), alt: 'After, half transparent' } } };
/** Both sides, as Before / after shows them. */
export const SideBySide: Story = {
  render: () => (
    <Compare>
      <CompareSide title="Before">
        <Shot src={page(false)} alt="Before: Start" region={region} mark="gone" />
      </CompareSide>
      <CompareSide title="After">
        <Shot src={page(true)} alt="After: Start" region={region} mark="here" />
      </CompareSide>
    </Compare>
  ),
};
