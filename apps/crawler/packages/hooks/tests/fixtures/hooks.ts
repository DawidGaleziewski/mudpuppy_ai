// A portal's hooks file, as an owner would write it (spec 023 US1).
import type { Hook } from '../../src/index.js';

export const acceptConsent: Hook<'onRunStart'> = async (ctx) => {
  await ctx.cookies.add([{ name: 'consent', value: '1', url: ctx.config.base_url }]);
  ctx.log('consent cookie set');
};

export const patchCalculator: Hook<'onPageLoad'> = async (ctx) => {
  await ctx.inPage((flag: string) => `patched ${flag}`, 'calc');
};

export const skipPrint: Hook<'onBeforePageLoad'> = (ctx) =>
  ctx.url.endsWith('/druk') ? { skip: true, reason: 'print view opens a dialog' } : undefined;

export const toEnglish: Hook<'onBeforePageLoad'> = (ctx) => ({ url: `${ctx.url}?lang=en` });

export const waitForPrice: Hook<'onBeforeClickAction'> = () => ({ waitFor: '#price' });

export const throws: Hook = () => {
  throw new Error('boom');
};

export const hangs: Hook = () => new Promise(() => {});

// A return outside the contract: onPageLoad takes none.
export const answersWrong = (() => ({ skip: true, reason: 'no' })) as unknown as Hook<'onPageLoad'>;

export const notAFunction = 42;
