/**
 * How the eval stops. Before the run: `die` exits at once. Inside the run: `abort` throws, so
 * `finally` still stops the portal server (spec 009 F-16). Exit codes: 2 bad input, preflight or
 * an agent's API error; 3 the account's usage limit (spec 020 T003), so a chain of evals stops.
 */

export const EXIT_USAGE_LIMIT = 3;

export function die(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

export class EvalAbort extends Error {
  constructor(
    message: string,
    readonly code = 2,
  ) {
    super(message);
  }
}

export function abort(msg: string, code = 2): never {
  throw new EvalAbort(msg, code);
}
