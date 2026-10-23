import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Bundle, Chip, Graph, GraphNode, Legend, Stack, Status, Tag, Text } from '../index.js';

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
          'A graph the API laid out (the portal map): edges are SVG paths in their state (`sy-edge--<state>`), nodes are `GraphNode` buttons at their place, with `aria-pressed` for the selected one; a folded route family is a link drawn as a deck. It sits in a `.sy-graphview` frame (design answer Q4): as tall as the graph, at most the screen below the header, or 520 px with `embedded` (a scan\'s graph, the recorded map). The zoom bar floats top right and stays in view while the graph does: −, the level (resets to 100 %), +, Fit (pressed while fitted); steps 25 · 33 · 50 · 67 · 80 · 100 · 125 · 150 %. It opens readable (round-3 Q3): fitted when that is 80 % or more, else at 80 % on the selected node or the start page; under 50 % it is an overview (`.sy-graph--overview`), where a click zooms to 100 % on the node. An edge with `arrow` gets an arrowhead from the graph\'s own marker (a move off the tree, designer 18/10). Keys in the graph: + / − zoom, 0 back to 100 %, arrow keys move to the neighbour that way (`near`). A graph is never the only way to its facts: the page also has the list. `Legend` names the edge states, `Bundle` says the links it does not draw (the menu on every page).',
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

/** Inside another page (a scan's graph, the recorded map): at most 520 px tall. */
export const Embedded: Story = { ...Map, args: { embedded: true } };

/** A recorded screen with several states (a deck), a mark for the next scan, and a failed one. */
export const RecordedNodes: Story = {
  args: { width: 340, height: H, edges: [] },
  render: (args) => (
    <Graph {...args}>
      <GraphNode
        id="f"
        x={0}
        y={0}
        height={H}
        route="/wniosek"
        title="Wniosek"
        deck
        marks={
          <Tag size="sm" intent>
            Probe
          </Tag>
        }
        meta={
          <>
            <Status status="ok">Observed</Status>
            <Chip>2 states</Chip>
            <Chip variant="dashed">+2 queued</Chip>
          </>
        }
      />
      <GraphNode
        id="o"
        x={190}
        y={0}
        height={H}
        route="/oferty"
        title="Oferty"
        state="failed"
        marks={
          <Tag size="sm" intent>
            Stopped here
          </Tag>
        }
        meta={
          <>
            <Status status="failed">Failed</Status>
            <Chip variant="fail">1 failed</Chip>
          </>
        }
      />
    </Graph>
  ),
};

/** The recorded map's moves (designer 18/10, 19/01): the tree, a move back up it with its arrowhead and step, another scan's move. */
export const RecordedMoves: Story = {
  args: {
    width: 420,
    height: 28 + H * 2 + 60,
    edges: [
      { d: `M80 ${String(28 + H)} C80 ${String(28 + H + 30)} 80 ${String(28 + H + 30)} 80 ${String(28 + H + 60)}`, state: 'tree' },
      { d: `M300 ${String(28 + H + 60)} C300 -40 80 -40 80 28`, state: 'offtree', arrow: 'end', label: '↩ step 140', labelX: 190, labelY: 16 },
      { d: `M80 ${String(28 + H)} C80 ${String(28 + H + 30)} 300 ${String(28 + H + 30)} 300 ${String(28 + H + 60)}`, state: 'others', label: '2 scans', labelX: 200, labelY: 28 + H + 26 },
    ],
  },
  render: (args) => (
    <Stack>
      <Graph {...args}>
        <GraphNode id="h" x={0} y={28} height={H} route="/" title="Start" />
        <GraphNode id="k" x={0} y={28 + H + 60} height={H} route="/kontakt" title="Kontakt" />
        <GraphNode id="p" x={220} y={28 + H + 60} height={H} route="/porownanie" title="Porównanie" dim meta={<Status status="unobserved">Not reached</Status>} />
      </Graph>
      <Legend
        label="Moves of this scan"
        items={[
          { state: 'tree', label: 'First visit' },
          { state: 'offtree', label: 'Move off the tree' },
          { state: 'others', label: "Other scans' move" },
          { state: 'failed', label: 'Failed' },
        ]}
      />
    </Stack>
  ),
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
