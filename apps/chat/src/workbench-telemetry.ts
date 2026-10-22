// Workbench telemetry (spec 043 T019, D-7; designer 14-workbench.md § 9.1): the events as JSON
// lines in data/logs/workbench/<day>.jsonl, to compute the beta's exit numbers later. Never message
// text, page content or screenshots; ids and counts only.

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export type TelemetryName =
  | 'wb_turn'
  | 'wb_path_switched'
  | 'wb_view_feedback'
  | 'wb_cmd'
  | 'wb_model_unavailable'
  | 'wb_ask';

export type Telemetry = (name: TelemetryName, props: Record<string, unknown>) => void;

/** A writer into `dir`; a failing write never breaks the Workbench (it is only counted). */
export function telemetryLog(dir: string, now: () => Date = () => new Date()): Telemetry {
  let pending: Promise<void> = Promise.resolve();
  return (name, props) => {
    const at = now();
    const line = `${JSON.stringify({ at: at.toISOString(), event: name, ...props })}\n`;
    pending = pending
      .then(() => mkdir(dir, { recursive: true }))
      .then(() => appendFile(join(dir, `${at.toISOString().slice(0, 10)}.jsonl`), line))
      .catch(() => undefined);
  };
}
