import type { Locator, Page } from 'playwright';

/** Portal `obstacles` entry: selectors come from config, never from code (FR-019). */
export interface ObstacleConfig {
  id: string;
  selector: string;
}

export interface ObstacleEvent {
  id: string;
  selector: string;
  /** `handler` = fired by Playwright while it waited to act; `sweep` = found by an explicit sweep. */
  via: 'handler' | 'sweep';
  at: number;
}

export interface ObstacleHandlers {
  /** Dismiss anything currently visible; call before a state is observed so overlays never enter it. */
  sweep(): Promise<ObstacleEvent[]>;
  /** Every dismissal so far, for the decision log. */
  readonly events: readonly ObstacleEvent[];
  dispose(): Promise<void>;
}

export interface ObstacleOptions {
  /** Max ms to wait for a dismissal click. Default 2000. */
  clickTimeoutMs?: number;
}

/**
 * Register handlers for the portal's known cookie banners, popups and chat widgets via
 * `addLocatorHandler` (so they are dismissed whenever they would block an action) and expose an
 * explicit `sweep()` for the moment just before observation. A selector that never matches costs
 * nothing; a click that fails is swallowed: an obstacle must never fail a crawl step.
 */
export async function registerObstacleHandlers(
  page: Page,
  obstacles: readonly ObstacleConfig[],
  opts: ObstacleOptions = {},
): Promise<ObstacleHandlers> {
  const timeout = opts.clickTimeoutMs ?? 2000;
  const events: ObstacleEvent[] = [];
  const locators: { ob: ObstacleConfig; loc: Locator }[] = [];

  const dismiss = async (
    ob: ObstacleConfig,
    loc: Locator,
    via: ObstacleEvent['via'],
  ): Promise<boolean> => {
    try {
      await loc.first().click({ timeout });
      events.push({ id: ob.id, selector: ob.selector, via, at: Date.now() });
      return true;
    } catch {
      return false;
    }
  };

  const register = async (): Promise<void> => {
    for (const { ob, loc } of locators) {
      await page.addLocatorHandler(loc.first(), async (l) => {
        events.push({ id: ob.id, selector: ob.selector, via: 'handler', at: Date.now() });
        await l.click({ timeout }).catch(() => undefined);
      });
    }
  };
  const unregister = async (): Promise<void> => {
    for (const { loc } of locators)
      await page.removeLocatorHandler(loc.first()).catch(() => undefined);
  };

  for (const ob of obstacles) locators.push({ ob, loc: page.locator(ob.selector) });
  await register();

  return {
    events,
    async sweep() {
      const before = events.length;
      // Nothing visible: nothing to do, and no need to touch the handlers.
      let anyVisible = false;
      for (const { loc } of locators) {
        if (
          await loc
            .first()
            .isVisible()
            .catch(() => false)
        )
          anyVisible = true;
      }
      if (!anyVisible) return [];
      // The handlers watch these same locators: while they are registered, a click on one is intercepted
      // by its own handler and then times out. Pause them for the sweep.
      await unregister();
      try {
        for (const { ob, loc } of locators) {
          // Re-check after each click: dismissing one popup can reveal the next.
          for (
            let i = 0;
            i < 3 &&
            (await loc
              .first()
              .isVisible()
              .catch(() => false));
            i++
          ) {
            if (!(await dismiss(ob, loc, 'sweep'))) break;
          }
        }
      } finally {
        await register();
      }
      return events.slice(before);
    },
    dispose: unregister,
  };
}
