import type { Meta, StoryObj } from '@storybook/react-vite';
import { Releases } from '../index.js';

const meta = {
  title: 'Components/Releases',
  component: Releases,
  args: {
    start: '2026-10-04T09:00:00Z',
    end: '2026-10-17T18:00:00Z',
    lanes: [
      {
        name: 'Shell',
        scope: 'shell',
        spans: [
          { name: '1d77', left: 0, width: 40, start: '2026-10-04T09:00:00Z', end: '2026-10-09T12:00:00Z', href: '#' },
          { name: 'both', left: 40, width: 6, start: '2026-10-09T12:00:00Z', end: '2026-10-10T08:00:00Z', rollout: true, href: '#' },
          { name: '3e1a', left: 46, width: 54, start: '2026-10-10T08:00:00Z', end: '2026-10-17T18:00:00Z', current: true, href: '#' },
        ],
      },
      {
        name: 'App kalkulator',
        scope: 'mfe:kalkulator',
        spans: [{ name: '9c21', left: 0, width: 100, start: '2026-10-04T09:00:00Z', end: '2026-10-17T18:00:00Z', current: true, unknown: true }],
      },
    ],
    scans: [
      { id: '01a1340c-0000-7000-8000-000000000001', left: 2, at: '2026-10-04T09:00:00Z', status: 'completed', href: '#' },
      { id: '01a1350d-0000-7000-8000-000000000002', left: 55, at: '2026-10-11T10:00:00Z', status: 'completed', check: true, href: '#' },
      { id: '01a1360e-0000-7000-8000-000000000003', left: 98, at: '2026-10-17T17:00:00Z', status: 'completed', href: '#' },
    ],
    axis: [
      { left: 0, label: '4 Oct' },
      { left: 25, label: '7 Oct' },
      { left: 50, label: '10 Oct' },
      { left: 75, label: '14 Oct' },
      { left: 100, label: '17 Oct' },
    ],
    range: { left: 46, width: 54, label: 'this range · 41 changes' },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Release lanes (designer v2-01 / v2-02): each portal part's releases over time, the scans under them (■ AI scan, ◇ check run, each a link), the date axis and the chosen range as chalk brackets. A release is a link when it has `href` (Changes from its start). A rollout (old and new served together) and a part without a release marker are dashed. Positions come from the server; a screen reader gets the whole timeline as one sentence.",
      },
    },
  },
} satisfies Meta<typeof Releases>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRange: Story = {};
export const NoRange: Story = { args: { range: null } };
/** No release told apart yet: one dashed "release unknown" lane. */
export const NoReleases: Story = { args: { lanes: [], range: null } };
