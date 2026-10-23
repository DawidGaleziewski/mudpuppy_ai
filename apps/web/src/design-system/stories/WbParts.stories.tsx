import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveBar, Narration, PathSwitch, Sheet, Stack, Suggestions, Text, WbLayout } from '../index.js';

const meta = {
  title: 'Generative UI/Workbench parts',
  component: WbLayout,
  args: {
    conversation: (
      <Stack>
        <LiveBar href="#t1-map">Scan 01a110e7-2068 · 12 steps · now at /porownanie</LiveBar>
        <Narration
          lines={[
            { at: '2026-10-06T10:47:02Z', clock: '10:47:02Z', text: 'Scan 01a110d5-2028 started.', step: 1, kind: 'milestone', ref: 'run#1' },
            { at: '2026-10-06T10:47:24Z', clock: '10:47:24Z', text: 'Opened /, Ubezpieczenia dla Ciebie.', step: 12, kind: 'visit', ref: 'run#12' },
          ]}
          onAsk={() => undefined}
        />
        <Suggestions items={['Why did it stop here?', 'What is on /kontakt?']} onPick={() => undefined} />
      </Stack>
    ),
    aside: (
      <Sheet title="/kontakt" onClose={() => undefined}>
        <Text>Kontakt · visited at step 167</Text>
      </Sheet>
    ),
  },
  parameters: {
    docs: {
      description: {
        component:
          'The Workbench (designer 14-workbench.md, phase 1 inline layout): the conversation with the live bar pinned while a scan runs, narration lines that cite their events (Ask on each), suggested follow-ups, and the side sheet for a selected page. `PathSwitch` marks whose choice the path is.',
      },
    },
  },
} satisfies Meta<typeof WbLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSheet: Story = {};
export const Path: Story = {
  render: () => <PathSwitch paths={[['chat', 'Chat'], ['mapping', 'Mapping']]} current="mapping" source="assistant" why="Picked by the assistant: you asked to map it." onSwitch={() => undefined} />,
};
