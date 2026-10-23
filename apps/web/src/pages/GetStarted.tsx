import { Plate, Stack, Steps, Text } from '../design-system';
import { useSettings } from '../app/api-settings';
import { planHref } from '../app/api-plan';

/**
 * Home of a portal with no scan yet (designer Q11): the three things before the first scan, each
 * a link to where it is done; it disappears after the first scan. Sign-in is only needed when the
 * portal needs one, so it is never "Needs you".
 */
export function GetStarted({ portal }: { portal: string }) {
  const s = useSettings(portal).data;
  const settings = `/app/portals/${encodeURIComponent(portal)}/settings`;
  const envSet = Boolean(s?.environments.some((e) => e.base_url));
  const signIn = Boolean(s?.personas.some((p) => p.refs.length > 0));
  const first = envSet ? 'needs' : 'todo';
  return (
    <Plate title="Get started" variant="intent">
      <Stack>
        <Steps
          label="Get started"
          steps={[
            { label: <Text href={settings}>Environment set: address, how far the crawler may go</Text>, status: envSet ? 'ok' : 'needs', ...(envSet ? {} : { current: true }) },
            { label: <Text href={settings}>Sign-in, if the portal needs one: a persona with a credential</Text>, status: signIn ? 'ok' : 'todo', word: signIn ? 'Done' : 'If needed' },
            { label: <Text href={planHref(portal)}>First scan</Text>, status: first, ...(envSet ? { current: true } : {}) },
          ]}
        />
        <Text small muted>Ask the assistant (Ctrl J) to start the first scan; this list goes once it has run.</Text>
      </Stack>
    </Plate>
  );
}
