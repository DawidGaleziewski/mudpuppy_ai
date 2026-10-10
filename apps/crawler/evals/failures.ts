/**
 * How the eval stops. Before the run: `die` exits at once. Inside the run: `abort` throws, so
 * `finally` still stops the portal server (spec 009 F-16); both end with exit code 2.
 */

export function die(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

export class EvalAbort extends Error {}

export function abort(msg: string): never {
  throw new EvalAbort(msg);
}
