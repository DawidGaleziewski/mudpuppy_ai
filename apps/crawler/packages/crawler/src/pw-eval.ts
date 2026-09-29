import type { Page } from 'playwright';

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
const NAME_SHIM =
  'var __name = (typeof __name === "function") ? __name : function (fn, name) {' +
  ' try { Object.defineProperty(fn, "name", { value: name, configurable: true }); } catch (e) {}' +
  ' return fn; };';

/** `page.evaluate(fn)`, immune to esbuild's dev-mode `__name` helper (see above). */
export function evalInPage<R>(page: Page, fn: () => R): Promise<R> {
  // Built via `new Function`, not a tsx-transpiled arrow: esbuild never sees this source, so the
  // wrapper itself carries no `__name` call, and `fn.toString()`'s own `__name(...)` calls now
  // resolve against the shim defined right above them, in one evaluate() round trip.
  const wrapped = new Function(`${NAME_SHIM} return (${fn.toString()})();`);
  return page.evaluate(wrapped as () => R);
}
