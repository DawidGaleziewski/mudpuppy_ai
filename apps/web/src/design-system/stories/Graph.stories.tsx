import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Bundle, Chip, Graph, GraphNode, Legend, Stack, Status, Text } from '../index.js';

const H = 96;
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const ym = (y1 + y2) / 2;
  return `M${String(x1)} ${String(y1)} C${String(x1)} ${String(ym)} ${String(x2)} ${String(ym)} ${String(x2)} ${String(y2)}`;
};

/** A small map as the dashboard lays it out: a home, two screens under it, a folded family. */
const NODES = [
  { id: 'a', key: 'SC-0001', route: '/', title: 'Strona główna', x: 190, y: 0, near: ['b', 'c', 'd'] },
  { id: 'b', key: 'SC-0002', route: '/kalkulator', title: 'Kalkulator OC/AC', x: 0, y: 166, near: ['a'] },
  { id: 'c', key: 'SC-0003', route: '/kontakt', title: 'Kontakt', x: 190, y: 166, near: ['a'] },
] as const;
const EDGES = [
  { d: curve(265, H, 75, 166), state: 'process' },
  { d: curve(265, H, 265, 166), state: 'unseen', label: 'age ≥ 18', labelX: 170, labelY: 140 },
  { d: curve(265, H, 455, 166), state: 'unchecked' },
];

const meta = {
  title: 'Components/Graph',
  component: Graph,
  args: { label: 'Map of liveinsurer now', width: 530, height: 262, edges: EDGES, children: null },
  parameters: {
    docs: {
      description: {
        component:
          'A graph the API laid out (the portal map): edges are SVG paths in their state (`sy-edge--<state>`), nodes are `GraphNode` buttons at their place, with `aria-pressed` for the selected one; a folded route family is a link drawn as a deck. Zoom out, fit and in above the box; arrow keys move to the neighbour that way (`near`). A graph is never the only way to its facts: the page also has the list. `Legend` names the edge states, `Bundle` says the links it does not draw (the menu on every page).',
      },
    },
  },
} satisfies Meta<typeof Graph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Map: Story = {
  render: function Render(args) {
    const [selected, setSelected] = useState('SC-0002');
    return (
      <Stack>
        <Bundle label="Bundled links">
          <Text>
            Menu on every page · <Text strong>6 links</Text> · bundled
          </Text>
        </Bundle>
        <Graph {...args}>
          {NODES.map((n) => (
            <GraphNode
              key={n.id}
              id={n.id}
              x={n.x}
              y={n.y}
              height={H}
              near={n.near}
              route={n.route}
              title={<Text asIs>{n.key === 'SC-0002' ? `Step 1 · ${n.title}` : n.title}</Text>}
              fullTitle={n.title}
              process={n.key === 'SC-0002'}
              dim={n.key === 'SC-0003'}
              pressed={selected === n.key}
              onSelect={() => setSelected(n.key)}
              meta={<Chip>2 actions inside</Chip>}
            />
          ))}
          <GraphNode id="d" x={380} y={166} height={H} near={['a']} route="/oferta/…" title="14 screens" href="#open" />
        </Graph>
        <Legend
          label="Link states"
          items={[
            { state: '', label: 'Active' },
            { state: 'process', label: 'Process overlay' },
            { state: 'unseen', label: 'Not seen since' },
            { state: 'unchecked', label: 'Not checked' },
          ]}
        />
      </Stack>
    );
  },
};

export const RetiredNode: Story = {
  args: { width: 150, height: H, edges: [] },
  render: (args) => (
    <Graph {...args}>
      <GraphNode
        id="r"
        x={0}
        y={0}
        height={H}
        route="/stara-oferta"
        title="Oferta 2025"
        state="retired"
        meta={<Status status="stopped">Retired</Status>}
      />
    </Graph>
  ),
};
