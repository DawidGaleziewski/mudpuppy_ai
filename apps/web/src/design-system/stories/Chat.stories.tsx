import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, ChatDivider, ChatLog, Chips, Cluster, Composer, Drawer, Field, Message, ProposalCard, Segmented, Status, Tag, Text, Textarea, Vault } from '../index.js';

const meta = {
  title: 'Components/Chat',
  component: Drawer,
  args: { title: 'Assistant', children: null },
  parameters: {
    docs: {
      description: {
        component:
          "The assistant (screens 01–03): `Drawer` beside the main column (head, context, conversation; Esc closes it), `ChatLog` (a `log` region that follows the newest message unless the person scrolled up, then offers \"New messages ↓\"; the drawer is one window high and only the log scrolls, designer Q8), `Message` (the assistant's, or the person's own with `mine`), `ChatDivider` (a system line), `Composer` (the message box), `Vault` (a credential the assistant asked for: its name, never its value), `ProposalCard` (a change the assistant drafted, dashed until applied) and `Chips` (suggestions). Text from the person or the agent is shown exactly as written.",
      },
    },
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  render: () => (
    <Drawer
      title="Assistant"
      actions={
        <Button size="sm" variant="quiet">
          Close
        </Button>
      }
      context={
        <Segmented
          label="What the assistant can see"
          items={[
            { value: 'page', label: 'This page' },
            { value: 'portal', label: 'Whole yard' },
          ]}
          selected="page"
          onSelect={() => undefined}
        />
      }
    >
      <ChatLog>
        <Message mine>Map the quote flow as a guest.</Message>
        <Message who="Assistant">
          <p>Starting a scan of reference-insurer as guest.</p>
        </Message>
        <ChatDivider>Scan finished · 10:42Z</ChatDivider>
        <Message who="Assistant">
          <Vault label="Credential · sandbox · client">
            <Cluster>
              <Text small>Credential · sandbox · client</Text>
              <Status status="needs">Needs you</Status>
            </Cluster>
            <Text small mono>
              LIVEINSURER_PASSWORD
            </Text>
          </Vault>
        </Message>
        <Message who="Assistant">
          <ProposalCard title="Proposed change" aside={<Tag size="sm">AMD-003</Tag>}>
            <Text>Check the tax on the premium.</Text>
          </ProposalCard>
        </Message>
      </ChatLog>
      <Chips label="Suggestions">
        <Button size="sm" variant="quiet">
          Explain this page
        </Button>
        <Button size="sm" variant="quiet">
          What changed since the last scan?
        </Button>
      </Chips>
      <Composer onSubmit={() => undefined}>
        <Field label="Message">
          <Textarea rows={2} placeholder="Ask about this page" />
        </Field>
        <Cluster>
          <Button variant="strong">Send</Button>
        </Cluster>
      </Composer>
    </Drawer>
  ),
};
