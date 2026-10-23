import type { Meta, StoryObj } from '@storybook/react-vite';
import { Status, Table, type StatusKind } from '../index.js';

interface Screen {
  route: string;
  status: StatusKind;
  states: number;
}

const rows: Screen[] = [
  { route: '/kalkulator/pojazd', status: 'ok', states: 3 },
  { route: '/kalkulator/opcje', status: 'ok', states: 2 },
  { route: '/moje-polisy', status: 'unobserved', states: 0 },
];

const columns = [
  { header: 'Screen', cell: (r: Screen) => r.route, rowHeader: true },
  { header: 'Status', cell: (r: Screen) => <Status status={r.status} /> },
  { header: 'States', cell: (r: Screen) => r.states, numeric: true },
];

const meta = {
  title: 'Components/Table',
  component: Table<Screen>,
  args: { caption: 'Screens', showCaption: true, columns, rows, rowKey: (r: Screen) => r.route },
  parameters: {
    docs: {
      description: {
        component:
          'A data table: column headers with scope, the naming column as row headers, numbers right-aligned in mono, and an empty state that says so. Show stored values exactly (Polish strings, ids, UTC timestamps). `flush` inside a plate; `dense` for long lists; `interactive` when every row is a link or a choice.',
      },
    },
  },
} satisfies Meta<typeof Table<Screen>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Screens: Story = {};
export const Dense: Story = { args: { dense: true } };
export const Empty: Story = { args: { rows: [], empty: 'No screens yet. Start a scan.' } };
