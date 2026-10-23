// Browser actions the assistant can ask for (spec 022 R6): the mudpuppy-chat tools
// `highlight_element`, `open_page` and `request_credential` do nothing server-side; when one
// completes, the chat service turns its input into a `ui_action` event the dashboard performs
// (a credential request is also kept in the history, credentialLine). Pure.

import { Environment } from '@mudpuppy/config';
import type { UiAction } from './events.js';

const PREFIX = 'mcp__mudpuppy-chat__';

/** Console pages the assistant may open (R-100: the React console under `/app/`), nothing else. */
const OPENABLE = /^\/app\/(?:portals|states|scans|search|glossary)(?:[/?#][^\s]*)?$/;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/** Vault reference names, as the credentials form accepts them. */
export const REF_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

function credentialOf(args: Record<string, unknown>): UiAction | null {
  const portal = str(args.portal);
  const persona = str(args.persona);
  const ref = str(args.ref);
  const env = Environment.safeParse(args.environment);
  const environment = env.success ? env.data : undefined;
  if (portal === null || persona === null || ref === null || environment === undefined) return null;
  if (!REF_NAME.test(ref)) return null;
  return {
    type: 'ui_action',
    action: 'credential',
    portal,
    environment,
    persona,
    ref,
    reason: str(args.reason),
  };
}

/**
 * The chat line that keeps a credential request in the history (role system, tool_name
 * `request_credential`). The dashboard reads it back with the same fixed shape; no value is ever
 * part of it.
 */
export function credentialLine(a: Extract<UiAction, { action: 'credential' }>): string {
  const head = `Credential needed: ${a.ref} · ${a.portal} · ${a.environment} · ${a.persona}.`;
  return a.reason === null ? head : `${head} ${a.reason.replace(/\s+/g, ' ')}`;
}

/** The UI action for a completed tool call, or null when the call is not a browser action. */
export function uiActionOf(tool: string | null, input: unknown): UiAction | null {
  if (tool === null || !tool.startsWith(PREFIX)) return null;
  const args =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const name = tool.slice(PREFIX.length);
  if (name === 'highlight_element') {
    const stateId = str(args.state_id);
    if (stateId === null) return null;
    return {
      type: 'ui_action',
      action: 'highlight',
      stateId,
      elementKey: str(args.element_key),
      label: str(args.label),
    };
  }
  if (name === 'request_credential') return credentialOf(args);
  if (name === 'open_page') {
    const path = str(args.path);
    if (path === null || !OPENABLE.test(path)) return null;
    return { type: 'ui_action', action: 'open', path };
  }
  return null;
}
