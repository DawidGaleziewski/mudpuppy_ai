/**
 * The crawl pipeline behind the browser tools (spec 012 R-34 split of `pipeline.ts`): one file per
 * step or tool, `processPage` as the ordered list of steps. Callers outside `runtime/` import the
 * runtime's own index only (G-12).
 */
export { act } from './act.js';
export type { ActionRow } from './actions.js';
export { navigationPolicy } from './gate.js';
export { login } from './login-step.js';
export { navigate } from './navigate.js';
export { beginStep, persistStop } from './stop.js';
