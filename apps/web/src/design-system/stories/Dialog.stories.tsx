import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button, Dialog, Split, Text } from '../index.js';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  args: { open: false, onClose: () => undefined, label: 'Dialog', children: null },
  parameters: {
    docs: {
      description: {
        component:
          'A modal dialog (`sy-dialog`) as a compound component (spec 076): `Dialog.Head`, `Dialog.Body` or `Dialog.Main` with `Dialog.Figure` and `Dialog.Aside`, `Dialog.Foot`, `Dialog.Close`. The owner holds `open`; Escape and the × call `onClose`; the parts render only while it is open and only inside a `Dialog`. `size="wide"` is the picture dialog, `"recording"` a recording with its facts column. `Confirm`, `RecordingDialog` and `Picture` are built on it.',
      },
    },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Parts: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button size="sm" onClick={() => setOpen(true)}>
          Open the dialog
        </Button>
        <Dialog open={open} onClose={() => setOpen(false)} label="About this dialog">
          <Dialog.Head>
            <Split>
              <h2 className="sy-plate__title">About this dialog</h2>
              <Dialog.Close />
            </Split>
          </Dialog.Head>
          <Dialog.Body>
            <Text block>Its parts arrange themselves the way the consumer writes them.</Text>
          </Dialog.Body>
          <Dialog.Foot>
            <Button variant="strong" onClick={() => setOpen(false)}>
              Done
            </Button>
          </Dialog.Foot>
        </Dialog>
      </>
    );
  },
};
