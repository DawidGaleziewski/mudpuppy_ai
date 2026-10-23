import type { Meta, StoryObj } from '@storybook/react-vite';
import { Facts, Stack, Steps } from '../index.js';

const meta = {
  title: 'Components/Steps',
  component: Steps,
  args: {
    label: 'Workflow',
    steps: [
      { label: '1 · Scan', status: 'stopped' },
      { label: '2 · Map screens', status: 'ok', word: '21' },
      { label: '3 · Sort into processes', status: 'needs', current: true },
      { label: '4 · Document as-is', status: 'todo' },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          '`Steps`: a workflow in order (the guided chat\'s tracker), each step with its status; the current one is marked for assistive technology. `Facts`: name–value pairs (a definition list).',
      },
    },
  },
} satisfies Meta<typeof Steps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Workflow: Story = {};
export const WithFacts: Story = {
  render: (args) => (
    <Stack>
      <Steps {...args} />
      <Facts
        items={[
          ['Portal', 'reference-insurer'],
          ['Environment', 'local-dev'],
          ['Persona', 'guest'],
        ]}
      />
    </Stack>
  ),
};
