import { useState } from 'react';
import { Button, Chips, Composer, Field, Input, Plate, Split, Stack, Text } from '../design-system';
import { useAssistantHandle } from '../app/assistant-context';

const SUGGESTIONS = ['What changed since the last scan?', 'What can I do here?', 'Sort screens into processes', 'Follow one process start to end'];

/**
 * The assistant on Home (designer v2-01): suggestions and a one-line message box. Sending opens
 * the drawer, the full chat, and sends it there; Ctrl+J opens the drawer too.
 */
export function HomeAssistant() {
  const { ask } = useAssistantHandle();
  const [text, setText] = useState('');
  const send = () => {
    const message = text.trim();
    if (!message) return;
    ask(message);
    setText('');
  };
  return (
    <Plate title="Assistant" actions={<Text small muted>whole portal</Text>}>
      <Stack>
        <Text small>Ask what changed, or have it explain a finding, start a check run or rebuild the model.</Text>
        <Chips label="Suggestions">
          {SUGGESTIONS.map((s) => (
            <Button key={s} size="sm" variant="quiet" onClick={() => ask(s)}>
              {s}
            </Button>
          ))}
        </Chips>
        <Text small muted>
          Its proposals land in Review and Processes, marked as the assistant&apos;s.
        </Text>
        <Composer onSubmit={send} label="Ask the assistant">
          <Field label="Message" help="Enter sends · Ctrl+J opens the full chat">
            <Input value={text} placeholder="Ask about this portal" onChange={(e) => setText(e.target.value)} />
          </Field>
          <Split>
            <span />
            <Button variant="strong" type="submit" disabled={!text.trim()}>
              Send
            </Button>
          </Split>
        </Composer>
      </Stack>
    </Plate>
  );
}
