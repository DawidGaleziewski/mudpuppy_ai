import pino, { type DestinationStream, type Logger } from 'pino';
import { SECRETS } from './secrets.js';

/**
 * Structured JSON logger. The MCP server speaks stdio, so logs go to stderr (fd 2) by default,
 * never stdout. (The decision-log writer lives in `@pathfinder/store`: it writes the DB.)
 */
export function createLogger(
  opts: { level?: string; destination?: DestinationStream } = {},
): Logger {
  return pino(
    {
      level: opts.level ?? 'info',
      base: undefined,
      // Registered credentials never reach a log line (spec 009 FR-019).
      formatters: { log: (obj) => SECRETS.redactJson(obj) },
      hooks: {
        logMethod(args, method) {
          method.apply(
            this,
            args.map((a) => (typeof a === 'string' ? SECRETS.redact(a) : a)) as typeof args,
          );
        },
      },
    },
    opts.destination ?? pino.destination(2),
  );
}
