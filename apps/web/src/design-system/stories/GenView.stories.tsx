import type { Meta, StoryObj } from '@storybook/react-vite';
import { Film, FilmItem, GenView, Meter } from '../index.js';

const meta = {
  title: 'Generative UI/GenView',
  component: GenView,
  args: {
    id: 't1-map',
    title: 'Live map',
    source: 'Live · events up to 10:52:42Z',
    card: true,
    status: { status: 'running', children: 'Running' },
    why: {
      path: 'Mapping · picked by the assistant',
      because: 'You asked to map the OC/AC calculator.',
      asked: 'Map the OC/AC calculator and what is around it.',
      shows: ['Live map of scan 01a110d5-2028 as a filmstrip, with its meter'],
      data: 'Events of scan 01a110d5-2028',
      switches: [['chat', 'Chat']],
    },
    feedback: { value: null, reasons: [], choices: [['wrong_path', 'Wrong path'], ['too_much', 'Too much']], onAnswer: () => undefined },
    children: (
      <>
        <Meter label="Scan 01a110d5-2028 · now at /kontakt" value={171} max={400} detail="171 steps · 17 pages · 113 queued" />
        <Film>
          <FilmItem order={1} route="/" status={{ status: 'ok', children: 'Visited' }} onSelect={() => undefined} />
          <FilmItem order={2} route="/kontakt" state="here" status={{ status: 'running', children: 'Crawler here' }} onSelect={() => undefined} />
          <FilmItem route="+113 queued" state="frontier" status={{ status: 'queued', children: 'Queued' }} />
        </Film>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        component:
          'A frame the assistant generated (designer 16-genui-components.md § 5.3): the "generated" mark, its status, "Why this view?" (only the spec\'s words and the server\'s) and "Right view?" on the lead frame, and where its data came from. Its body is a catalogue component: a filmstrip and meter (LiveMap), a record, a list, narration.',
      },
    },
  },
} satisfies Meta<typeof GenView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveMap: Story = {};
export const Failure: Story = { args: { title: 'Scan stopped', failure: true, status: { status: 'stopped', children: 'Stopped' }, why: null, feedback: null, children: 'element not found after 10 s. The scan stopped; 17 pages and 113 queued links are kept.' } };
