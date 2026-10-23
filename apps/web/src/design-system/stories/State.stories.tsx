import type { Meta, StoryObj } from '@storybook/react-vite';
import { State } from '../index.js';

const meta = {
  title: 'Components/State',
  component: State,
  args: { title: 'Reading the screens', loading: true },
  parameters: {
    docs: {
      description: {
        component:
          'A region\'s loading, empty or failed state (designer § States). Loading says what is being read, with the blinking caret as the only mark (no spinners, no shimmer); the page keeps its head and frame, only the body waits (R-103 (5)). Empty says what is missing and the next move; failed gives the reference and what still works.',
      },
    },
  },
} satisfies Meta<typeof State>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const Empty: Story = { args: { loading: false, title: 'No scans yet', children: 'Start one from the assistant.' } };
export const Failed: Story = {
  args: { loading: false, failure: true, title: 'Could not load the screens', children: 'Check that the dashboard runs (port 8765), then reload.' },
};
