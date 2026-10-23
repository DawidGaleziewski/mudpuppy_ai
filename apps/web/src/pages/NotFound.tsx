import { Callout, LinkButton, PageHead } from '../design-system';
import { Shell } from '../app/Shell';

/** Any address under /app/ the console does not know: say so and offer the way back. */
export function NotFound() {
  return (
    <Shell current="portals">
      <PageHead title="Not found" />
      <Callout title="This page does not exist">
        The address may be from an older console, or mistyped. The portals list still works.{' '}
        <LinkButton href="/app/" variant="quiet" size="sm">
          Open Portals
        </LinkButton>
      </Callout>
    </Shell>
  );
}
