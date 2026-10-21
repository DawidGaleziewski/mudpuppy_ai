import type { DocContent } from '@pathfinder/docs-model';
import type { BaContext } from '../../context.js';
import { ToolError } from '../../errors.js';

/**
 * An `api_endpoint` record documents a call the crawler captured (spec 038 FR-008, field C-10), so it
 * cites at least one `network_call`, and its method and path are that call's: a record of an
 * endpoint nobody saw would be a guess dressed as evidence (constitution II).
 */
export function assertApiEndpointCitesCall(
  ctx: BaContext,
  content: DocContent,
  evidence: readonly { target_kind: string; target_id: string }[],
): void {
  if (content.kind !== 'api_endpoint') return;
  const ids = evidence.filter((e) => e.target_kind === 'network_call').map((e) => e.target_id);
  const find = ctx.raw.prepare('SELECT method, url_template FROM network_calls WHERE id = ?');
  const calls = ids
    .map((id) => find.get(id) as { method: string; url_template: string } | undefined)
    .filter((c): c is { method: string; url_template: string } => c !== undefined);
  const same = (c: { method: string; url_template: string }) =>
    c.method.toUpperCase() === content.method.toUpperCase() && pathOf(c.url_template) === pathOf(content.path);
  if (calls.some(same)) return;
  throw new ToolError(
    'API_CALL_NOT_CITED',
    calls.length === 0
      ? 'an api_endpoint cites at least one network_call (get_run_evidence kind network_calls) as evidence'
      : `content.method/path ${content.method} ${content.path} is none of the cited calls (${calls.map((c) => `${c.method} ${c.url_template}`).join(', ')}); write the call's method and URL template as captured`,
    { kind: 'api_endpoint', cited: calls },
  );
}

/** The path of a URL template, so `https://host/api/x` and `/api/x` name one endpoint. */
function pathOf(template: string): string {
  try {
    return new URL(template, 'http://relative.invalid').pathname;
  } catch {
    return template;
  }
}
