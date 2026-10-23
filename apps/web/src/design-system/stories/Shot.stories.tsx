import type { Meta, StoryObj } from '@storybook/react-vite';
import { Compare, CompareOverlay, CompareSide, Shot } from '../index.js';

// Stand-in pages: small SVGs, so the story needs no recorded evidence. The after page has a button;
// the banner page has a banner inserted at the top, which pushes the rest down by 60 px.
const page = (button: boolean) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="#f4f1ea"/><rect x="40" y="20" width="500" height="20" fill="#2b2b2b"/><rect x="40" y="120" width="900" height="16" fill="#bbb"/>${button ? '<rect x="100" y="50" width="200" height="25" fill="#1d4ed8"/>' : ''}</svg>`,
  )}`;
const banner = (on: boolean) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${on ? 560 : 500}"><rect width="1000" height="${on ? 560 : 500}" fill="#f4f1ea"/><rect x="40" y="20" width="500" height="20" fill="#2b2b2b"/>${on ? '<rect x="0" y="60" width="1000" height="60" fill="#d97706"/>' : ''}<rect x="40" y="${on ? 180 : 120}" width="900" height="16" fill="#bbb"/></svg>`,
  )}`;
const region = { left: 10, top: 10, width: 20, height: 5 };

const meta = {
  title: 'Components/Shot',
  component: Shot,
  args: { src: page(true), alt: 'After: Start', region },
  parameters: {
    docs: {
      description: {
        component:
          'A recorded page at full width (designer v2-03, 12-v2-ux § 6). `region` outlines the changed region with "Changed" (`.sy-mark--overlay`, the system pointing). `gone` marks where the change is not, on the side without it (designer Q5a, `.sy-mark--gone`): a dashed `box` at its place for things that float, a dashed `line` at the insertion point for a region that was inserted and pushed the page down. The mark is decoration: say it in `alt`. `layer` puts it in a `CompareOverlay` (Q5b). `marks` numbers a record\'s cited elements; `note` marks an amendment pin.',
      },
    },
  },
} satisfies Meta<typeof Shot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Changed: Story = {};
export const NotHereBox: Story = { args: { src: page(false), alt: 'Before: Start, without the button; a dashed box marks where it is on the other visit', region: null, gone: { shape: 'box', ...region } } };
/** An inserted banner: on the side without it, a line where it would go. */
export const NotHereLine: Story = {
  args: { src: banner(false), alt: 'Before: wynik, without the banner; a dashed line marks where it appears on the other visit', region: null, gone: { shape: 'line', left: 0, top: 12, width: 100, height: 0 } },
};
/** A record's cited elements on one screen, numbered (Docs). */
export const Numbered: Story = {
  args: {
    region: null,
    marks: [
      { region, label: '1', title: 'button|dalej||' },
      { region: { left: 4, top: 24, width: 90, height: 3.2 }, label: '2', title: 'text|model||' },
    ],
  },
};
/** Both sides, as Before / after shows them. */
export const SideBySide: Story = {
  render: () => (
    <Compare>
      <CompareSide title="Before">
        <Shot src={banner(false)} alt="Before: wynik, without the banner; a dashed line marks where it appears on the other visit" gone={{ shape: 'line', left: 0, top: 12, width: 100, height: 0 }} />
      </CompareSide>
      <CompareSide title="After">
        <Shot src={banner(true)} alt="After: wynik" region={{ left: 0, top: 60 / 5.6, width: 100, height: 60 / 5.6 }} />
      </CompareSide>
    </Compare>
  ),
};
/** Overlay (Q5b): the after over the before, the mix on a slider, the mark at full strength. */
export const Overlay: Story = {
  render: () => (
    <CompareOverlay
      title="Before, with After over it"
      under={<Shot layer="under" src={page(false)} alt="Before: Start, with After drawn over it" />}
      over={<Shot layer="over" src={page(true)} alt="" region={region} />}
    />
  ),
};
