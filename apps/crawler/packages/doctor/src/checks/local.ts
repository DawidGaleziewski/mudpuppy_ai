// Checks of this machine (field GC-06 native build, a browser that cannot start, R-61 environments).

import { requireEnvironment } from '@mudpuppy/config';
import type { Check } from '../registry.js';

export const envDeclared: Check = {
  id: 'env.declared',
  title: 'The environment is declared by a portal',
  probe: (ctx) => {
    try {
      requireEnvironment(ctx.root, ctx.environment);
      return Promise.resolve({ status: 'ok', detail: `environment "${ctx.environment}"` });
    } catch (e) {
      return Promise.resolve({
        status: 'fail',
        detail: (e as Error).message,
        fix: 'add it to the portal file (environments:) or pick a declared one with --env',
      });
    }
  },
};

export const toolchainSqlite: Check = {
  id: 'toolchain.sqlite',
  title: 'The SQLite native module loads',
  probe: async () => {
    try {
      const { default: Database } = await import('better-sqlite3');
      new Database(':memory:').close();
      return { status: 'ok', detail: 'better-sqlite3 opens an in-memory database' };
    } catch (e) {
      return {
        status: 'fail',
        detail: `better-sqlite3 does not load: ${(e as Error).message.split('\n')[0]}`,
        fix: 'install a C/C++ build toolchain and run pnpm install again, or use a prebuilt binary for this Node version (pnpm rebuild better-sqlite3)',
      };
    }
  },
};

export const browserLaunch: Check = {
  id: 'browser.launch',
  title: 'Headless Chromium starts',
  probe: async () => {
    try {
      const { chromium } = await import('playwright');
      const b = await chromium.launch({ headless: true });
      await b.close();
      return { status: 'ok', detail: 'Chromium started and closed' };
    } catch (e) {
      const msg = (e as Error).message;
      return {
        status: 'fail',
        detail: msg.split('\n')[0] ?? msg,
        fix: /missing (dependencies|libraries)|lib\w+\.so/i.test(msg)
          ? 'install the system libraries: pnpm --dir apps/crawler exec playwright install-deps chromium'
          : 'install the browser: pnpm --dir apps/crawler exec playwright install chromium',
      };
    }
  },
};
