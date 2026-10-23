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
          'A Mermaid diagram (a trace run\'s process map, the capability map) drawn in the Salvage Yard tokens, in the map\'s frame (R-103 (9)): the graph view with its zoom bar (−, level, +, Fit) and the same zoom as the map (Ctrl / ⌘ + wheel or a pinch at the pointer; + / − / 0 when focused). It opens readable: its own size when that fits, else fitted at 80 % or more, else 80 % from its top-left; `embedded` caps it at 520 px inside a record or a scan tab. A step label "1. kind: intent" is escaped for Mermaid (else it draws "Unsupported markdown: list"); the stored source is unchanged. Mermaid is the console\'s vendored copy (`public/vendor/mermaid.min.js`, served at `/app/vendor/`), loaded only when a diagram is shown, with `securityLevel: strict`. Until it is drawn, and if it cannot be (Storybook does not serve `/app/`), the source is shown as text: it is also the diagram\'s text alternative.',
      },
    },
  },
} satisfies Meta<typeof Diagram>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In Storybook the dashboard's Mermaid is not served, so this shows the text fallback. */
export const ProcessMap: Story = {};
