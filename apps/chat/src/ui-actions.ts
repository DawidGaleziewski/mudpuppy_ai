// Browser actions the assistant can ask for (spec 022 R6): the pathfinder-chat tools
// `highlight_element` and `open_page` do nothing server-side; when one completes, the chat
// service turns its input into a `ui_action` event the dashboard's drawer performs. Pure.

import type { UiAction } from './events.js';

const PREFIX = 'mcp__pathfinder-chat__';

/** Dashboard paths the assistant may open: the portal sections and record pages, nothing else. */
const OPENABLE =
  /^\/(?:states|runs|docs|screens|processes|review|scans|search|amendments|portals)(?:[/?#][^\s]*)?$/;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

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
  if (name === 'open_page') {
    const path = str(args.path);
    if (path === null || !OPENABLE.test(path)) return null;
    return { type: 'ui_action', action: 'open', path };
  }
  return null;
}
