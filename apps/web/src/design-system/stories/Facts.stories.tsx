import type { Meta, StoryObj } from '@storybook/react-vite';
import { Facts, Text } from '../index.js';

const meta = {
  title: 'Components/Facts',
  component: Facts,
  args: {
    items: [
      ['Portal', 'reference-insurer'],
      ['Environment', 'local-dev'],
      ['Base URL', <Text mono>http://127.0.0.1:4010/</Text>],
      ['Persona', 'guest'],
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          'Name–value facts as a definition list: the settings of a portal, the context of a scan. Values are shown exactly as stored; identifiers and URLs in `Text mono`.',
      },
    },
  },
} satisfies Meta<typeof Facts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PortalFacts: Story = {};
