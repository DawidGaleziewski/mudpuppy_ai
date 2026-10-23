import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, Status, Text, Timeline, TimelineItem } from '../index.js';

const meta = {
  title: 'Components/Timeline',
  component: Timeline,
  args: { label: 'History', children: null },
  parameters: {
    docs: {
      description: {
        component:
          'A history: revisions, changes on a screen, answers. Each `TimelineItem` has a head (what, its status, when) and a muted body. The marker says the state with a shape: `ok` settled, `draft` waits for a person (to-be corners), `live` now, `failed` a cross.',
      },
    },
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Changes: Story = {
  render: () => (
    <Timeline label="History">
      <TimelineItem
        status="draft"
        head={
          <>
            <Chip>New element</Chip> <Status status="needs">Needs you</Status>{' '}
            <Text mono small muted>
              model version 4 · 2026-10-23T00:27:17Z
            </Text>
          </>
        }
      >
        A new button &quot;Oblicz składkę&quot; on the calculator.
      </TimelineItem>
      <TimelineItem
        status="ok"
        head={
          <>
            <Chip>Release</Chip> <Status status="ok">Explained</Status>{' '}
            <Text mono small muted>
              model version 3 · 2026-10-22T21:00:00Z
            </Text>
          </>
        }
      >
        The footer changed with release 5696.
      </TimelineItem>
      <TimelineItem status="failed" head="Replay failed">
        The page did not load.
      </TimelineItem>
    </Timeline>
  ),
};
