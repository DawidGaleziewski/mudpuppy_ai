/**
 * How the eval stops. Before the trial: `die` exits at once. Inside it: `abort` throws, so
 * `finally` still removes the workspace. Exit codes: 2 bad input or an agent's API error; 3 the
 * account's usage limit, so a chain of evals stops (as the crawler eval, spec 020 T003).
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
