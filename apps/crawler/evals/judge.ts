/**
 * `pnpm eval:judge <portal> --store <path> [--judge <id>]` (spec 017 US1, contracts/commands.md):
 * the judges over an existing store, without a new trial. Per ground-truth item it prints the
 * code matcher's verdict next to the judge's, which is the owner's exercise 5.3 (who is right
 * where they disagree?). Writes nothing to the store; saves a report per judge under
 * `data/evals/judges/<id>/<timestamp>-store.json`. Exit 2 on bad input or when a judge cannot run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { evaluate, loadEvalInput, type GroundTruth } from '@pathfinder/docs';
import { openDb } from '@pathfinder/store';
import { REPO_ROOT } from './config.js';
import { die } from './failures.js';
import {
  describeLogin,
  judgeById,
  judgeLine,
  JUDGES,
  JudgeSetupError,
  judgeStore,
  resolveJudgeLogin,
} from './graders/model/index.js';
import { judgeReportsDir } from './graders/model/reports.js';
import { categoryItemIds } from './graders/model/store-pairs.js';
import { loadGroundTruth, taskFor } from './tasks.js';

const USAGE = 'usage: pnpm eval:judge <portal> --store <path> [--judge <id>]';

function args() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: { store: { type: 'string' }, judge: { type: 'string' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    return die(`${(e as Error).message}\n${USAGE}`);
  }
}

/** Ground-truth id → record keys the code matcher accepted, per category. */
async function codeMatches(storePath: string, portal: string, gt: GroundTruth) {
  const opened = openDb(storePath);
  opened.raw.pragma('query_only = ON');
  const input = loadEvalInput(opened.raw, portal);
  await opened.close();
  const report = evaluate({ portal_id: portal, ...input, groundTruth: gt });
  return (category: string): Record<string, string[]> =>
    (report.scores as Record<string, { matches: Record<string, string[]> } | undefined>)[category]
      ?.matches ?? {};
}

const { values, positionals } = args();
const portal = positionals[0] ?? die(USAGE);
const storePath = resolve(values.store ?? die(USAGE));
const task = taskFor(portal) ?? die(`no eval task for ${portal}`);
const judges = values.judge
  ? [
      judgeById(values.judge) ??
        die(`no judge ${values.judge}; judges: ${JUDGES.map((j) => j.id).join(', ')}`),
    ]
  : JUDGES;
const groundTruth = loadGroundTruth(REPO_ROOT, task);

try {
  const login = resolveJudgeLogin();
  console.log(`${relative(REPO_ROOT, storePath)} (${portal}), login: ${describeLogin(login)}`);
  const code = await codeMatches(storePath, portal, groundTruth);
  const out = await judgeStore({ root: REPO_ROOT, storePath, portal, groundTruth, judges, login });
  const at = new Date().toISOString();
  for (const { result, pairs } of out) {
    const def = judges.find((j) => j.id === result.id)!;
    const matched = code(def.category);
    const passedBy = new Map<string, string[]>();
    for (const v of result.verdicts.filter((x) => x.verdict === 'pass')) {
      const p = pairs.find((x) => x.id === v.pair_id)!;
      passedBy.set(p.itemId, [...(passedBy.get(p.itemId) ?? []), p.record.key]);
    }
    console.log(`\n${judgeLine(result)}\n\n  item   code    judge   (record keys)`);
    const items = categoryItemIds(def, groundTruth).map((id) => {
      const c = matched[id] ?? [];
      const j = passedBy.get(id) ?? [];
      const mark = c.length > 0 === j.length > 0 ? ' ' : '≠';
      console.log(
        `${mark} ${id.padEnd(6)} ${(c.length > 0 ? 'yes' : 'no').padEnd(7)} ${(j.length > 0 ? 'yes' : 'no').padEnd(7)} code: ${c.join(', ') || '–'} · judge: ${j.join(', ') || '–'}`,
      );
      return { id, code: c, judge: j };
    });
    for (const v of result.verdicts.filter((x) => x.verdict !== 'pass'))
      console.log(`  ${v.verdict.padEnd(7)} ${v.pair_id}: ${v.reason}`);
    const dir = judgeReportsDir(REPO_ROOT, result.id);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${at.replace(/[:.]/g, '-')}-store.json`);
    const report = { at, store: relative(REPO_ROOT, storePath), portal, result, items };
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${relative(process.cwd(), file)}`);
  }
} catch (e) {
  if (e instanceof JudgeSetupError) die(`judge cannot run (${e.code}): ${e.message}`);
  throw e;
}
