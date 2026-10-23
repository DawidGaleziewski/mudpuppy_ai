import type { Meta, StoryObj } from '@storybook/react-vite';
import { Note } from '../index.js';

const meta = {
  title: 'Components/Note',
  component: Note,
  args: { children: 'Driver data and options in one form. Price updates as you fill it.', by: 'Dawid · 23 Oct' },
  parameters: {
    docs: {
      description: {
        component:
          'Humans type, machines print (rule 4): a note is text a person wrote (an amendment, a reason, a review comment), in the hand-lettered face, with who wrote it. Machine output is never a note.',
      },
    },
  },
} satisfies Meta<typeof Note>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAuthor: Story = {};
export const Small: Story = { args: { size: 'sm', by: undefined, children: 'Ask about the 15-year AC limit.' } };
