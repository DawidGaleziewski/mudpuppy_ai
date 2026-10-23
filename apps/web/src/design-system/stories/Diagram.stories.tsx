import type { Meta, StoryObj } from '@storybook/react-vite';
import { Diagram } from '../index.js';

const meta = {
  title: 'Components/Diagram',
  component: Diagram,
  args: {
    caption: 'Process map from the recorded steps',
    source: [
      'flowchart TD',
      '  start(["Buy a car policy"])',
      '  s1["1. navigate: Open the calculator"]',
      '  s2["2. fill: Enter the car model"]',
      '  s3["3. click: Calculate the premium"]',
      '  start --> s1 --> s2 --> s3',
    ].join('\n'),
  },
  parameters: {
    docs: {
      description: {
        component:
          'A Mermaid diagram (a trace run\'s process map) drawn in the Salvage Yard tokens. Mermaid is the console\'s vendored copy (`public/vendor/mermaid.min.js`, served at `/app/vendor/`), loaded only when a diagram is shown, with `securityLevel: strict`. Until it is drawn, and if it cannot be (Storybook does not serve `/app/`), the source is shown as text: it is also the diagram\'s text alternative.',
      },
    },
  },
} satisfies Meta<typeof Diagram>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In Storybook the dashboard's Mermaid is not served, so this shows the text fallback. */
export const ProcessMap: Story = {};
