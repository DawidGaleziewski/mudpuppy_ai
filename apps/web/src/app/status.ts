// The product's values as design-system statuses (rule 8: one mapping per domain, never inline).
import type { StatusKind } from '../design-system';
import type { ScanStatus } from './api';

/** A scan's status: its shape and its word (status map: `[RUN.]` running, `[INT.]` stopped). */
export const SCAN_STATUS: Record<ScanStatus, { status: StatusKind; word: string }> = {
  running: { status: 'running', word: 'Running' },
  completed: { status: 'ok', word: 'Done' },
  interrupted: { status: 'stopped', word: 'Interrupted' },
  stopped_warning: { status: 'failed', word: 'Stopped' },
};
