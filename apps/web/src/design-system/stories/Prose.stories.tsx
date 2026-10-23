import type { Meta, StoryObj } from '@storybook/react-vite';
import { Prose } from '../index.js';

const meta = {
  title: 'Components/Prose',
  component: Prose,
  args: {
    label: 'README.md',
    html: '<h2>PROC-001 Quote</h2><p>The rebuild-grade export of this process. <a href="/app/portals/shop/processes/PROC-001/documentation?tab=GAPS.md">Gaps</a></p><div class="sy-table-wrap"><table class="sy-table sy-table--dense"><thead><tr><th>Step</th><th>Screen</th></tr></thead><tbody><tr><td>1</td><td>/kalkulator/kierowca?src=menu&amp;utm_source=newsletter</td></tr></tbody></table></div>',
  },
  parameters: {
    docs: {
      description: {
        component:
          'A document the dashboard rendered from markdown without raw HTML (the documentation export\'s files). Long recorded URLs break anywhere; tables and code scroll inside their own box. `onLink` lets the app move to its own pages without a page load.',
      },
    },
  },
} satisfies Meta<typeof Prose>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Document: Story = {};
