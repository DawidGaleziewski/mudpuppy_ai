import type { Preview } from '@storybook/react-vite';
import '../src/design-system/styles.js';

// Every story on the grid ground (rule 5), dark only (design decision D-01), with autodocs.
const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { expanded: true },
    options: { storySort: { order: ['Design system', ['Introduction', 'Rules', 'Tokens'], 'Components', 'Shell'] } },
  },
  decorators: [
    (Story) => (
      <div className="sy-ground" style={{ padding: '24px', minHeight: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
