import type { Frame, Locator, Page } from 'playwright';

/**
 * `page.evaluate(fn)` serialises `fn` via `Function.prototype.toString()` and runs the resulting
 * source in Playwright's own isolated "utility world" — a JS realm separate from the page's main
 * `window` (so `context.addInitScript`, which only reaches the main world, cannot help) and reset
 * on every navigation (so nothing defined by an earlier `evaluate()` call can be relied on to
 * still be there).
 *
 * Running the server under `tsx` (esbuild's dev transform, `keepNames: true` for stack traces,
 * not user-configurable — see tsx's bundled esbuild options) wraps every named function or arrow
 * bound to a const *inside* `fn`'s source with a call to esbuild's own `__name(fn, "name")`
 * runtime helper. That helper is never defined in the page, so any `evaluate()` whose body
 * declares a named local throws `ReferenceError: __name is not defined` — reproducibly, on every
 * real run started via `tsx src/main.ts` (the command `.mcp.json` and `pnpm start` both use).
 * Invisible under `vitest`, which transforms differently. A compiled (non-tsx) build never emits
 * the helper call, so this is a no-op there.
 *
 * Fix: define the same shim esbuild's runtime provides, textually inside the *same* evaluate()
 * call, so it exists regardless of which world or navigation Playwright evaluates it in.
 */
export const NAME_SHIM =
  'var __name = (typeof __name === "function") ? __name : function (fn, name) {' +
  ' try { Object.defineProperty(fn, "name", { value: name, configurable: true }); } catch (e) {}' +
  ' return fn; };';

/** `page.evaluate(fn)`, immune to esbuild's dev-mode `__name` helper (see above). */
export function evalInPage<R>(page: Page | Frame, fn: () => R): Promise<R> {
  // Built via `new Function`, not a tsx-transpiled arrow: esbuild never sees this source, so the
  // wrapper itself carries no `__name` call, and `fn.toString()`'s own `__name(...)` calls now
  // resolve against the shim defined right above them, in one evaluate() round trip.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate, see the comment above
  const wrapped = new Function(`${NAME_SHIM} return (${fn.toString()})();`);
  return page.evaluate(wrapped as () => R);
}

/**
 * {@link evalInPage} for in-page code split into helpers (G-02): each helper is a top-level
 * `function name(…)` declaration whose source is sent along, so `fn` can call them by name.
 */
export function evalWithHelpers<R>(
  page: Page | Frame,
  helpers: readonly ((...args: never[]) => unknown)[],
  fn: () => R,
): Promise<R> {
  const defs = helpers.map((h) => h.toString()).join('\n');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- same `__name` shim as evalInPage
  const wrapped = new Function(`${NAME_SHIM}\n${defs}\nreturn (${fn.toString()})();`);
  return page.evaluate(wrapped as () => R);
}

/** {@link evalOnElement} with helper functions sent along, as in {@link evalWithHelpers}. */
export function evalOnElementWithHelpers<A, R>(
  locator: Locator,
  helpers: readonly ((...args: never[]) => unknown)[],
  fn: (el: Element, arg: A) => R,
  arg: A,
): Promise<R> {
  const defs = helpers.map((h) => h.toString()).join('\n');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- same `__name` shim as evalInPage
  const wrapped = new Function(
    'el',
    'arg',
    `${NAME_SHIM}\n${defs}\nreturn (${fn.toString()})(el, arg);`,
  );
  return locator.evaluate(wrapped as never, arg as never);
}

/** `locator.evaluate(fn, arg)` with the same `__name` shim as {@link evalInPage}. */
export function evalOnElement<A, R>(
  locator: Locator,
  fn: (el: Element, arg: A) => R,
  arg: A,
): Promise<R> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- same `__name` shim as evalInPage
  const wrapped = new Function('el', 'arg', `${NAME_SHIM} return (${fn.toString()})(el, arg);`);
  // Playwright's PageFunctionOn typing cannot see through `new Function`; the call is the same.
  return locator.evaluate(wrapped as never, arg as never);
}
