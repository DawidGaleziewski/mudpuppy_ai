import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PictureBrowser, RowPicture, Stack, Text } from '../index.js';

const items = [
  { key: 'SC-012', title: 'Kalkulator OC/AC — dane kierowcy', route: '/kalkulator/kierowca', shot: null, href: '#' },
  { key: 'SC-013', title: 'Kontakt', route: '/kontakt', shot: null, href: '#' },
  { key: 'SC-014', title: 'Login', route: '/login', shot: null },
];

function Live({ sortable }: { sortable: boolean }) {
  const [index, setIndex] = useState<number | null>(0);
  const [ticked, setTicked] = useState<string[]>(['SC-012']);
  const tick = (key: string) => setTicked((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));
  return (
    <Stack>
      <Text small muted>{`Shown: ${index === null ? 'closed' : String(index + 1)}`}</Text>
      <PictureBrowser
        index={index}
        onIndex={setIndex}
        onClose={() => setIndex(null)}
        items={items}
        label="in no process"
        variants={[{ label: 'r1' }, { label: 'r2' }]}
        {...(sortable && {
          pick: {
            tickLabel: 'In the new process',
            ticked: (k: string) => ticked.includes(k),
            step: (k: string) => (ticked.includes(k) ? ticked.indexOf(k) + 1 : null),
            onTick: tick,
            addEntries: () => [{ key: 'p', label: 'Napisz do nas', note: 'guest · 2 steps', onSelect: () => undefined }],
          },
        })}
      />
    </Stack>
  );
}

const meta = {
  title: 'Components/PictureBrowser',
  component: PictureBrowser,
  parameters: {
    docs: {
      description: {
        component:
          'The picture dialog browsing the list it was opened from (designer T-04, D-68): ← → and J K step through the list, Shift + ← → through the screen\'s variants (a switch in the head). From a list you sort the foot carries its tick (X, with the step number) and Add to process (A). It never edits the screen; its height stays while stepping. Opened from a row picture (`RowPicture`, T-03: 96 px, 72 in a dense table, "no picture" hatched with its reason).',
      },
    },
  },
} satisfies Meta<typeof PictureBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = { index: 0, onIndex: () => undefined, onClose: () => undefined, items, label: 'in this list' };

export const FromAList: Story = { args: base, render: () => <Live sortable={false} /> };
export const FromASortableList: Story = { args: base, render: () => <Live sortable /> };

export const RowPictures: Story = {
  args: base,
  render: () => (
    <Stack>
      <RowPicture src="/vite.svg" alt="Kontakt" onOpen={() => undefined}>
        <Text>Kontakt</Text>
        <Text route>/kontakt</Text>
      </RowPicture>
      <RowPicture alt="Login" missing="behind a login">
        <Text>Login</Text>
        <Text route>/login</Text>
      </RowPicture>
    </Stack>
  ),
};
