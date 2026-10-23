import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchBox } from '../index.js';

const meta = {
  title: 'Components/SearchBox',
  component: SearchBox,
  args: { value: '', onSearch: () => undefined },
  parameters: {
    docs: {
      description: {
        component:
          'The header\'s search (`.sy-search`): screens by title or route, records by key or title, scans by id. Ctrl K focuses it from anywhere; Enter searches (the app moves to its results).',
      },
    },
  },
} satisfies Meta<typeof SearchBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithQuery: Story = { args: { value: 'kalkulator' } };
