import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack, SubHead, Text } from '../index.js';

const meta = {
  title: 'Components/Text',
  component: Text,
  args: { children: '/kalkulator/pojazd', mono: true },
  parameters: {
    docs: {
      description: {
        component:
          'Text in one of the system\'s faces and tones. `mono` for identifiers, routes and UTC timestamps (shown exactly as stored); `muted` for secondary text; `small` for notes under a line. Pages never set a font or a size themselves.',
      },
    },
  },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mono: Story = {};
export const Variants: Story = {
  render: () => (
    <Stack>
      <Text>Prose in Archivo.</Text>
      <Text mono>2026-10-23T00:10:53.427Z</Text>
      <Text muted small>
        last scan 23 Oct
      </Text>
      <Text block muted>
        A paragraph of secondary text.
      </Text>
      <Text route>/kalkulator/pojazd</Text>
      <Text asIs>Kalkulator OC/AC (a stored title, not in caps)</Text>
      <Text>
        <Text strong>anna.ba</Text>: same screen
      </Text>
      <Text route href="#">
        /kalkulator/… (a link)
      </Text>
    </Stack>
  ),
};
/** `SubHead`: the heading of a part inside a plate. */
export const Heading: Story = {
  render: () => (
    <Stack>
      <SubHead>Variants · 3</SubHead>
      <Text small muted>
        r1 Baseline · r2 Release 5696 · r3 Persona premium
      </Text>
    </Stack>
  ),
};
