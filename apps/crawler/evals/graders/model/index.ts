/**
 * Model-based graders (spec 017; G-33): judges that ask headless Claude one narrow question per
 * (ground-truth item, record) pair, trusted only once calibrated against the owner's labels
 * (`../human/labels.ts`). What the eval entry points use.
 */
import { join } from 'node:path';
import type { GroundTruth } from '@pathfinder/docs';
import type { JudgeRunResult } from '@pathfinder/gates';
import { dbPathFor } from '@pathfinder/store';
import type { EvalConfig } from '../../config.js';
import { judgeLine, judgeStore } from './judge-step.js';
import { JUDGES } from './judges/index.js';
import { describeLogin, resolveJudgeLogin } from './login.js';
import { JudgeSetupError } from './setup-error.js';

export { judgeLine, judgeStore } from './judge-step.js';
export { judgeById, JUDGES } from './judges/index.js';
export { describeLogin, resolveJudgeLogin } from './login.js';
export { JudgeSetupError } from './setup-error.js';

/**
 * The judge step of a trial: none when judges are off or the BA did not run. A judge that cannot
 * run (login, usage limit) is reported and leaves no `judges` section; the trial result is still
 * written with its code scores.
 */
export async function judgeTrial(
  c: EvalConfig,
  ws: string,
  groundTruth: GroundTruth,
): Promise<JudgeRunResult[] | undefined> {
  if (!c.judges || c.crawlerOnly) return undefined;
  try {
    const login = resolveJudgeLogin();
    console.log(`judges: ${JUDGES.map((j) => j.id).join(', ')} (login: ${describeLogin(login)})`);
    const out = await judgeStore({
      root: c.root,
      storePath: dbPathFor(join(ws, 'data'), c.env),
      portal: c.portal,
      groundTruth,
      judges: JUDGES,
      login,
    });
    for (const { result } of out) console.log(judgeLine(result));
    return out.map((o) => o.result);
  } catch (e) {
    if (!(e instanceof JudgeSetupError)) throw e;
    console.error(`judges skipped (${e.code}): ${e.message}`);
    return undefined;
  }
}

/** For `--dry-run`: which login the judges would use, without a call. */
export function judgeLoginLine(c: EvalConfig): string {
  if (!c.judges) return 'judges: off (--no-judges)';
  try {
    return `judges: ${JUDGES.length}, login: ${describeLogin(resolveJudgeLogin())}`;
  } catch (e) {
    if (!(e instanceof JudgeSetupError)) throw e;
    return `judges: cannot run (${e.code}): ${e.message}`;
  }
}
