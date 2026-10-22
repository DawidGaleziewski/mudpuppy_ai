// The environment a server opens (spec 030 R-61, owner D-1 2026-10-15): `MUDPUPPY_ENV`, which
// must be set (there is no default; the servers used to fall back to `production` silently) and
// declared by a portal, or an eval environment. Anything else stops the server before it opens a
// store, naming the declared environments.

import { ConfigError, requireEnvironment } from '@mudpuppy/config';

export function bootEnvironment(root: string, env = process.env.MUDPUPPY_ENV): string {
  try {
    return requireEnvironment(root, env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`mudpuppy: ${err.problems.join('; ')}`);
    process.exit(2);
  }
}
