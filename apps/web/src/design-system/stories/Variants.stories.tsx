import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, Picture, Status, Text, Variant, Variants } from '../index.js';

const shot = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#f4f1ea"/><rect x="40" y="40" width="600" height="48" fill="#2b2b2b"/><rect x="40" y="140" width="1200" height="20" fill="#bbb"/></svg>',
)}`;

const card = (n: number) => (
  <Variant
    key={n}
    id={`story-r${String(n)}`}
    label={`r${String(n)}`}
    aside={<Chip>{n === 1 ? 'Baseline' : `Release 9c2${String(n)}`}</Chip>}
    picture={<Picture shot={shot} title="Kalkulator OC/AC — wynik" alt={`Variant r${String(n)} of Kalkulator OC/AC — wynik`} />}
  >
    <Text small muted block>
      5f08 · guest · 3 visits · 2026-10-04 – 2026-10-15
    </Text>
    <Status status="ok">Observed</Status>
  </Variant>
);

const meta = {
  title: 'Components/Variants',
  component: Variants,
  args: { children: [1, 2, 3].map(card) },
  parameters: {
    docs: {
      description: {
        component:
          "A screen's variants as a list (`.sy-variants`, design answer Q3): every card keeps one column's width (240 px minimum) however many there are, and the rest of the row stays empty. A lone variant switches to picture left, facts right (at most 960 px) and says that a second one appears when a scan sees the screen differently. Inside a card: head (name and why), picture, facts, status and its explanation, actions. Not for before / after: that is `Compare`.",
      },
    },
  },
} satisfies Meta<typeof Variants>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Three: Story = {};
export const One: Story = { args: { children: card(1) } };
export const Four: Story = { args: { children: [1, 2, 3, 4].map(card) } };
