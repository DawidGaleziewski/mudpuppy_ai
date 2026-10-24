import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandCard, Field, Input, Select, Stack } from '../index.js';

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
          'A command the assistant proposes (designer § 5.12): every write asks first. Confirm is the one marker button on screen and sends the card\'s one-time token; nothing runs before it. Seven states: proposed, running, done, failed, cancelled, expired, undone. A Start card asks "As" which persona scans, and can offer "Add a persona…" (`onAddPersona`). A card whose values the person owns (`edit`, designer 19/04: Add a persona) has its fields as a form (`.sy-cmd__form`), Confirm submits what they show, a field the person changed carries the manila edge (`Field edited`); a done one can offer Undo (`onUndo`).',
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
/** Designer T-13, owner D-4: a start the crawler refused before a run existed; Start again runs the confirmed copy in one press. */
export const DidntStart: Story = {
  name: "Didn't start",
  args: {
    title: 'Start a map scan',
    state: 'failed',
    status: { status: 'failed', children: "Didn't start" },
    error: 'The crawler could not start the scan: robots.txt could not be read.',
    errorRef: 'ERR-DOWN',
    notStarted: { onAgain: () => undefined, check: '/app/portals/reference-insurer/settings' },
  },
};
/** After Start again: the copy runs below, so the button is gone. */
export const DidntStartAgainPressed: Story = {
  name: "Didn't start, started again",
  args: { ...DidntStart.args, notStarted: { check: '/app/portals/reference-insurer/settings' } },
};
/** Add a persona (designer 19/04): the fields the assistant drafted, one changed by the person. */
export const Editable: Story = {
  args: {
    title: 'Add a persona',
    reason: 'Przedłuż polisę needs a signed-in customer, and no persona of this portal can sign in.',
    facts: [['Undo', 'Undo removes the persona until a scan uses it.']],
    edit: {
      ready: true,
      body: (
        <Stack>
          <Field label="Name" edited help="Changed by you (was “klient”).">
            <Input defaultValue="client" />
          </Field>
          <Field label="Signs in with" help="A credential named in the vault, never its value.">
            <Select defaultValue="REF_INSURER_KLIENT">
              <option value="">Nothing: browses as a guest</option>
              <option>REF_INSURER_KLIENT</option>
            </Select>
          </Field>
        </Stack>
      ),
    },
  },
};
export const StartAsWithAdd: Story = { args: { ...StartAs.args, onAddPersona: () => undefined } };
export const DoneWithUndo: Story = { args: { title: 'Add a persona', state: 'done', status: { status: 'ok', children: 'Done' }, result: 'Persona client added to reference-insurer. Scans on sandbox can now sign in as client.', resultLinks: [['Open in Settings ▸ Personas', '/app/portals/reference-insurer/settings']], onUndo: () => undefined } };
