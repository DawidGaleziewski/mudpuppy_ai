import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PhaseBar, PhaseKey, Stack, Status, Text, type BarPhase, type PhaseBarProps } from '../index.js';

const stopped: BarPhase[] = [
  { name: 'Start', kind: 'work', state: 'done', seconds: 11, lastStep: 11, timeLine: '10:49:20Z · 11 s · steps 1–11' },
  { name: 'Explore', kind: 'work', state: 'done', seconds: 249, lastStep: 76, timeLine: '10:49:31Z · 4 min 9 s · steps 12–76' },
  { name: 'Fill forms', kind: 'work', state: 'done', seconds: 205, lastStep: 139, timeLine: '10:53:40Z · 3 min 25 s · steps 77–139' },
  { name: 'Explore', kind: 'work', state: 'failed', seconds: 99, lastStep: 171, timeLine: '10:57:05Z · 1 min 39 s · steps 140–171' },
];

const running: BarPhase[] = [
  { name: 'Start', kind: 'work', state: 'done', seconds: 20, lastStep: 4, timeLine: '11:40:02Z · 20 s · steps 1–4' },
  { name: 'Explore', kind: 'work', state: 'done', seconds: 300, lastStep: 60, timeLine: '11:40:22Z · 5 min 0 s · steps 5–60' },
  { name: 'Waiting for you', kind: 'wait', state: 'done', seconds: 140, lastStep: null, timeLine: '11:45:22Z · 2 min 20 s · no steps' },
  { name: 'Quiet', kind: 'quiet', state: 'done', seconds: 90, lastStep: null, timeLine: '11:47:42Z · 1 min 30 s · no steps' },
  { name: 'Fill forms', kind: 'work', state: 'running', seconds: 330, lastStep: 112, timeLine: '11:49:12Z · 5 min 30 s · steps 61–112' },
];

const meta = {
  title: 'Components/PhaseBar',
  component: PhaseBar,
  args: {
    caption: (
      <span>
        Phases · AI scan 01a110d5-2028 · 6 Oct 10:49:20Z – 10:58:44Z · 9 min 24 s · 171 steps <Status status="stopped">Stopped</Status>
      </span>
    ),
    phases: stopped,
    axis: [
      { left: 0, label: '10:49:20Z' },
      { left: 7.1, label: '10:50Z' },
      { left: 28.4, label: '10:52Z' },
      { left: 49.6, label: '10:54Z' },
      { left: 70.9, label: '10:56Z' },
      { left: 92.2, label: '10:58Z' },
      { left: 100, label: '10:58:44Z' },
    ],
    selected: null,
    onSelect: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        component:
          "A scan's time cut into its phases (designer 19/02, `.sy-phasebar`), above the Trace tab's calls. The phases are data from the dashboard (Start, Replay, Explore, Fill forms, Probe; Waiting for you after a handoff; Quiet for a minute or more without a call); the bar never invents one. Each phase is a button as wide as its share of the time (at least 24 px); pressing it filters what is under the bar, pressing it again clears it, one at a time. Waiting for you is the only orange, a failure only a red end cap, a running scan's end dashed. Under 72 px a phase shows its name only. The axis keeps both ends and thins the round times between to 64 px apart. `PhaseKey` is the legend, once per page.",
      },
    },
  },
} satisfies Meta<typeof PhaseBar>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live(args: PhaseBarProps) {
  const [selected, setSelected] = useState<number | null>(args.selected);
  return (
    <Stack>
      <PhaseBar {...args} selected={selected} onSelect={setSelected} />
      <PhaseKey />
      {selected !== null && <Text small>{`Showing ${args.phases[selected]?.name ?? ''}`}</Text>}
    </Stack>
  );
}

/** A stopped scan that ended in a failure; press a phase. */
export const Stopped: Story = { render: (args) => <Live {...args} /> };

/** A running scan with a wait for a person and a quiet stretch; its end is "now". */
export const Running: Story = {
  args: {
    caption: (
      <span>
        Phases · AI scan 01a110e7-2068 · 23 Oct 11:40:02Z – now 11:54Z · 14 min 30 s · 112 steps <Status status="running">Running</Status>
      </span>
    ),
    phases: running,
    axis: [
      { left: 0, label: '11:40:02Z' },
      { left: 34, label: '11:45Z' },
      { left: 69, label: '11:50Z' },
      { left: 100, label: 'now 11:54Z' },
    ],
  },
  render: (args) => <Live {...args} />,
};
