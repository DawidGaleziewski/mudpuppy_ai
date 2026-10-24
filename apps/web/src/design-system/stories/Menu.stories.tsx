import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeaderPicker, Menu, StoreMark } from '../index.js';

const meta = {
  title: 'Components/Menu',
  component: Menu,
  args: {
    label: 'Add to process',
    button: 'Add to process ▾',
    searchAfter: 8,
    searchLabel: 'Find a process',
    entries: [
      { label: 'Last used', group: true },
      { key: 'p2', label: 'Napisz do nas', aside: 'proposed', note: 'guest · 2 steps · adds to its scope', onSelect: () => undefined },
      { label: 'Processes · guest', group: true },
      { key: 'p1', label: 'Oblicz składkę OC/AC', note: 'guest · 6 steps', onSelect: () => undefined },
      { key: 'p3', label: 'Test process', aside: 'already in', disabled: true },
      { separator: true },
      { key: 'new', label: 'New process from these…', onSelect: () => undefined },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          'A menu button and its popup (`.sy-menu`, designer T-05, T-11): actions or choices that do not fit on the page. The popup hangs under the button, out of the flow, so nothing moves (FE-V45). ↑ / ↓ move, Esc closes and returns focus to the button, a click outside closes. Items are links (`href`) or actions (`onSelect`); a radio item (`checked`) marks the current choice; one that does not apply here is `disabled` (`aria-disabled`, shown with why in `aside`). Past `searchAfter` items a filter field comes first.',
      },
    },
  },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddToProcess: Story = {};

/** The header's portal picker with its store (designer T-11): one label, two halves. */
export const PortalWithStore: Story = {
  render: () => (
    <HeaderPicker label="Portal" joined>
      <Menu look="select" label="Switch portal" button="reference-insurer" buttonLabel="Portal: reference-insurer" entries={[{ key: 'w', label: 'wikipedia', href: '#' }]} />
      <Menu
        look="store"
        label="Data store"
        buttonLabel="Data store: sandbox, read-only"
        button={
          <>
            <StoreMark />
            sandbox
          </>
        }
        entries={[
          { label: 'Stores of reference-insurer', group: true },
          { key: 's', label: 'sandbox', aside: 'read-only', note: 'data/db/sandbox.sqlite · 22 MB · writes go through commands', checked: true, href: '#' },
          { separator: true },
          { key: 'set', label: 'Data store settings', href: '#' },
        ]}
      />
    </HeaderPicker>
  ),
};
