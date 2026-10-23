import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check, Field, Fieldset, Input, Select, Stack, Textarea } from '../index.js';

const meta = {
  title: 'Components/Field',
  component: Field,
  args: { label: 'Process name', help: 'Max 200 characters.', children: <Input defaultValue="Oblicz składkę OC/AC" /> },
  parameters: {
    docs: {
      description: {
        component:
          'A labelled form control: `Field` ties its label, help and error to one `Input`, `Select` or `Textarea` (the error marks it invalid and is read with it). A `Select` never navigates on change (WCAG 3.2.2): a portal switch is a menu of links. Secrets are never shown: vault references only.',
      },
    },
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHelp: Story = {};
export const WithError: Story = {
  args: { label: 'Reason', help: undefined, error: 'A decision needs a reason.', children: <Textarea /> },
};
export const Form: Story = {
  render: () => (
    <Stack>
      <Field label="Process name" help="Max 200 characters.">
        <Input defaultValue="Oblicz składkę OC/AC" />
      </Field>
      <Field label="Persona">
        <Select defaultValue="guest">
          <option>guest</option>
          <option>klient</option>
        </Select>
      </Field>
      <Check label="Load images" defaultChecked />
    </Stack>
  ),
};
/** `Fieldset`: checks under one label (the map's layers). */
export const Group: Story = {
  render: () => (
    <Fieldset legend="Layers">
      <Check label="Retired links" />
      <Check label="Not seen since" defaultChecked />
      <Check label="Not checked" defaultChecked />
    </Fieldset>
  ),
};
