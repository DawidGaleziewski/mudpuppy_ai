import type { Meta, StoryObj } from '@storybook/react-vite';
import { Path } from '../index.js';

const meta = {
  title: 'Components/Path',
  component: Path,
  args: {
    label: 'Path to where it stopped',
    steps: [
      { id: 'a', label: '/', onSelect: () => undefined },
      { id: 'b', label: '/oferty', onSelect: () => undefined },
      { id: 'c', label: '/oferty/oc', here: true, onSelect: () => undefined },
      { id: 'x', label: '✕ Dalej', failed: true },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          'A path of steps joined by arrows (`sy-path`): a scan from its first screen to where it stopped. `here` marks the step it ends on, `failed` the action that failed after it (red, never selectable). A step with `onSelect` is a button that selects that screen.',
      },
    },
  },
} satisfies Meta<typeof Path>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Stopped: Story = {};
export const Plain: Story = {
  args: { label: 'Path', steps: [{ id: 'a', label: '/' }, { id: 'b', label: '/kontakt', here: true }] },
};
