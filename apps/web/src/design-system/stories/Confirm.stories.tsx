import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button, Confirm, Text } from '../index.js';

const meta = {
  title: 'Components/Confirm',
  component: Confirm,
  args: {
    open: false,
    title: 'Mark Start here?',
    confirmLabel: 'Mark Start here',
    children: 'The next focused scan replays to Kalkulator and explores from it. The mark waits in the Next scan plan until a scan uses it.',
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        component:
          'The confirm before every write (skill rule 8): a modal dialog (`sy-dialog`) whose heading is the question and whose body says what will happen, the target and the effect. Cancel and one confirming button named for the action (`strong`, never a second primary on the view); Escape cancels. `busy` while the write is on its way. The page shows the answer after it as a live `Callout`.',
      },
    },
  },
} satisfies Meta<typeof Confirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mark: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState('');
    return (
      <>
        <Button size="sm" onClick={() => setOpen(true)}>
          Mark Start here
        </Button>{' '}
        <Text small muted>
          {done}
        </Text>
        <Confirm
          {...args}
          open={open}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            setDone('Marked Start here.');
          }}
        />
      </>
    );
  },
};

export const Busy: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button size="sm" onClick={() => setOpen(true)}>
          Resume
        </Button>
        <Confirm
          {...args}
          title="Resume this scan?"
          confirmLabel="Resume"
          busy
          open={open}
          onCancel={() => setOpen(false)}
        >
          A new scan of guest in sandbox starts, linked to this one. The request goes to the portal&apos;s conversation.
        </Confirm>
      </>
    );
  },
};
