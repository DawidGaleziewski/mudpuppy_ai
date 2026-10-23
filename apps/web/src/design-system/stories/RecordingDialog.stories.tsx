import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Check, Cluster, Facts, Fieldset, RecordingDialog, Shot, Split, Text } from '../index.js';

const page = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#f4f1ea"/><rect x="40" y="20" width="500" height="20" fill="#2b2b2b"/><rect x="100" y="200" width="300" height="30" fill="#bbb"/><rect x="100" y="300" width="300" height="30" fill="#bbb"/></svg>',
)}`;

const meta = {
  title: 'Components/RecordingDialog',
  component: RecordingDialog,
  args: {
    open: true,
    onClose: () => undefined,
    heading: 'Kalkulator OC/AC — dane kierowcy · variant r1 · recording',
    meta: 'visit 01a110d5-2028 · 6 Oct 10:53:40Z · guest',
    view: 'shot',
    onView: () => undefined,
    figure: (
      <Shot
        src={page}
        alt="Recording of Kalkulator"
        marks={[
          { region: { left: 10, top: 28, width: 30, height: 5 }, label: 'Marked by assistant' },
          { region: { left: 10, top: 42, width: 30, height: 5 }, label: 'AMD-003', note: true },
        ]}
      />
    ),
    aside: (
      <>
        <Facts items={[['Screen', 'Kalkulator · variant r1'], ['Reached at', <Text key="r" route>/kalkulator/kierowca</Text>], ['Settled', 'settled']]} />
        <Fieldset legend="Show on the picture">
          <Check label="Assistant's marks (1)" defaultChecked />
          <Check label="Amendment pins (1)" defaultChecked />
          <Check label="Elements (14)" />
        </Fieldset>
      </>
    ),
    foot: (
      <Split>
        <Cluster>
          <Button size="sm">← earlier variant</Button>
          <Button size="sm">later variant →</Button>
          <Text small muted>1 of 3 variants</Text>
        </Cluster>
        <Button size="sm">Copy link</Button>
      </Split>
    ),
  },
  parameters: {
    docs: {
      description: {
        component:
          'A recording (one visit of a screen) in the wide picture dialog with a facts column (designer 19-console-answers Q10). It opens over the Screen page with `?recording=`; the old `/states/{id}` addresses lead here. Assistant marks are `.sy-mark`, amendment pins `.sy-mark--note` (a `Shot` mark with `note`). Under 1024 px the facts go under the picture.',
      },
    },
  },
} satisfies Meta<typeof RecordingDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
