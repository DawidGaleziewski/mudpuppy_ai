import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Choice, Kbd, KeyBar, Stack, Status } from '../index.js';

const meta = {
  title: 'Components/Choice',
  component: Choice,
  args: {
    name: 'answer',
    value: 'same',
    checked: true,
    onChange: () => undefined,
    label: 'Same screen',
    what: 'Keep one screen; the two stay variants of it.',
    shortcut: '1',
  },
  parameters: {
    docs: {
      description: {
        component:
          'One answer of a question as a large radio card (Same screen?). The whole card is the label; `what` says what choosing it does and describes the radio; `shortcut` shows its single key. `KeyBar` lists the page\'s keys under the form; `Kbd` draws one key.',
      },
    },
  },
} satisfies Meta<typeof Choice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Chosen: Story = {};

const ANSWERS = [
  ['same', 'Same screen', 'Keep one screen; the two stay variants of it.'],
  ['same_data', 'Same, different data', 'Keep one screen; what differs is content that depends on data.'],
  ['different', 'Different screens', 'Two screens: the next rebuild splits them apart.'],
] as const;

function QuestionDemo() {
  const [value, setValue] = useState('');
  return (
    <Stack>
      {ANSWERS.map(([v, label, what], i) => (
        <Choice key={v} name="q" value={v} checked={value === v} onChange={setValue} label={label} what={what} shortcut={String(i + 1)}>
          {v === 'same' && <Status status="inferred">Automatic grouping</Status>}
        </Choice>
      ))}
      <KeyBar keys={[[<Kbd key="1">1</Kbd>, 'answer'], [<Kbd key="w">W</Kbd>, 'why'], [<Kbd key="e">Enter</Kbd>, 'save']]} />
    </Stack>
  );
}

export const Question: Story = { render: () => <QuestionDemo /> };
