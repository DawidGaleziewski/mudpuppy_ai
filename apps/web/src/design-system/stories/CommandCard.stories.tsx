import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandCard } from '../index.js';

const meta = {
  title: 'Generative UI/CommandCard',
  component: CommandCard,
  args: {
    title: 'Resume from last checkpoint',
    state: 'proposed',
    status: { status: 'draft', children: 'Proposed' },
    facts: [
      ['Starts', 'a new scan that continues 01a110d5-2028'],
      ['From', '/porownanie (last good checkpoint)'],
      ['Undo', 'Not undoable. You can stop the new scan.'],
    ],
    reason: "the form's button never appeared.",
    proposedBy: 'assistant',
  },
  parameters: {
    docs: {
      description: {
        component:
          'A command the assistant proposes (designer § 5.12): every write asks first. Confirm is the one marker button on screen and sends the card\'s one-time token; nothing runs before it. Seven states: proposed, running, done, failed, cancelled, expired, undone. A Start card asks "As" which persona scans.',
      },
    },
  },
} satisfies Meta<typeof CommandCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Proposed: Story = {};
export const StartAs: Story = { args: { title: 'Start a map scan', askPersona: true, personas: ['guest', 'client'], persona: 'guest' } };
export const Running: Story = { args: { state: 'running', status: { status: 'running', children: 'Running' }, runningWord: 'Resuming…' } };
export const Done: Story = { args: { state: 'done', status: { status: 'ok', children: 'Done' }, result: 'Started scan 01a110e7-2068.', resultLinks: [['Open in Scans', '/app/scans/01a110e7-2068']] } };
export const Failed: Story = { args: { state: 'failed', status: { status: 'failed', children: 'Failed' }, error: 'The scan is already running.' } };
export const Cancelled: Story = { args: { state: 'cancelled' } };
