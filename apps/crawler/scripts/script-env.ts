// The environment an operator script works on (spec 030 R-61, owner D-1): `--env` or
// `MUDPUPPY_ENV`; there is no default (the scripts used to fall back to `production` silently).
// A name some portal declares, an eval name, or a store that already exists under `root` (a script
// that reads an existing store, like the dashboard's review call on a test or eval workspace, cannot
// create a stray one). Anything else ends the script with exit code 2.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, Environment, requireEnvironment } from '@mudpuppy/config';

export function scriptEnvironment(root: string, given: string | undefined): string {
  const name = given ?? process.env.MUDPUPPY_ENV;
  if (
    name !== undefined &&
    Environment.safeParse(name).success &&
    existsSync(join(root, 'data', 'db', `${name}.sqlite`))
  )
    return name;
  try {
    return requireEnvironment(root, name);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(e.problems.join('; '));
    process.exit(2);
  }
}
