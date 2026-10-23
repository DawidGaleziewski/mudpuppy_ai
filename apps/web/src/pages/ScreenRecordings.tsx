import { Disclosure, Plate, Stack, Text } from '../design-system';
import type { ScreenRecordings } from '../app/api-state';
import type { Ask } from '../app/ConfirmedWrite';
import { FormStepPlate, ReachedUnder } from './ScreenInputs';

/** The Screen page head's "Reached at" (designer Q10): the newest URL, and every URL with its visits on demand. */
export function ReachedAt({ rec }: { rec: ScreenRecordings }) {
  const [first] = rec.urls;
  if (!first) return null;
  const more = rec.urls.length - 1 + rec.urls_more;
  return (
    <Stack>
      <Text small>
        {'Reached at '}
        <Text route>{first.url}</Text>
      </Text>
      {more > 0 && (
        <Disclosure summary={`+ ${String(more)} more URL${more === 1 ? '' : 's'}`}>
          <ReachedUnder urls={rec.urls} more={rec.urls_more} params={rec.params} />
        </Disclosure>
      )}
    </Stack>
  );
}

/** The Screen page's Inputs (designer Q10, v1 screen 13 in 2.0 parts): each form step, its states, what each probe did. */
export function Inputs({ rec, ask }: { rec: ScreenRecordings; ask: (a: Ask) => void }) {
  if (rec.inputs.length === 0)
    return (
      <Plate label="Inputs">
        <Text small muted>No form step was recorded on this screen.</Text>
      </Plate>
    );
  return (
    <Stack>
      {rec.inputs.map((step) => (
        <FormStepPlate key={`${String(step.step)}-${step.route}`} step={step} current={step.states[0]?.state ?? rec.state} canMark={rec.can_mark} ask={ask} />
      ))}
    </Stack>
  );
}
