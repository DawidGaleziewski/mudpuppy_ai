/**
 * `pnpm eval:calibrate <judge-id> --split dev|test` (spec 017 US3, contracts/commands.md): every
 * labelled pair of the split judged 3 times; prints the agreement table, TPR, TNR, flip rate and
 * every disagreement, and saves the report under `data/evals/judges/<judge-id>/`. The `test` split
 * is meant to be used once per wording (learning/05); a repeat is allowed but said out loud.
 * Exit 0 whether or not the bar is met; 2 on bad input or when the judge cannot run.
 */
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './config.js';
import { die } from './failures.js';
import { labelPath, readLabels, type LabelledPair } from './graders/human/labels.js';
import { agreement, BAR, meetsBar, type Agreement } from './graders/model/calibration.js';
import { judgeVersion, type JudgeDefinition, type Pair } from './graders/model/definition.js';
import { judgeById, JUDGES } from './graders/model/judges/index.js';
import { describeLogin, resolveJudgeLogin } from './graders/model/login.js';
import { hasTestReport, judgeReportsDir, saveReport } from './graders/model/reports.js';
import { runJudge } from './graders/model/run.js';
import { JudgeSetupError } from './graders/model/setup-error.js';

const USAGE = 'usage: pnpm eval:calibrate <judge-id> --split dev|test';
const RUNS = 3;

function args() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: { split: { type: 'string' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    return die(`${(e as Error).message}\n${USAGE}`);
  }
}

const toPair = (p: LabelledPair): Pair => ({
  id: p.id,
  itemId: p.id.split('~')[0] ?? p.id,
  item: p.item,
  record: { key: p.record.key, rev: p.record.rev, kind: 'labelled', text: p.record.text },
});

/** A test pair shown to the judge as an example would grade the judge on its own answer key. */
function exampleLeaks(def: JudgeDefinition, test: readonly LabelledPair[]): string[] {
  const same = (a: string, b: string) => a.trim() === b.trim();
  return test
    .filter((p) => def.examples.some((e) => same(e.item, p.item) && same(e.record, p.record.text)))
    .map((p) => p.id);
}

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 1000) / 10} %`);

function print(a: Agreement, judged: number): void {
  const t = a.table;
  console.log(
    [
      '',
      `                judge pass   judge fail`,
      `you: pass      ${String(t.tp).padStart(6)}       ${String(t.fn).padStart(6)}`,
      `you: fail      ${String(t.fp).padStart(6)}       ${String(t.tn).padStart(6)}`,
      '',
      `TPR ${pct(a.tpr)} · TNR ${pct(a.tnr)} · flip rate ${pct(a.flip_rate)} over ${judged} pairs × ${RUNS} runs`,
    ].join('\n'),
  );
  if (a.skipped.length > 0) console.log(`skipped (no label or why): ${a.skipped.join(', ')}`);
  for (const d of a.disagreements)
    console.log(
      `\n✗ ${d.pair_id}: you ${d.label} ("${d.why}"), judge ${d.majority}\n` +
        d.reasons.map((r) => `    ${r}`).join('\n'),
    );
}

const { values, positionals } = args();
const judge =
  judgeById(positionals[0] ?? '') ?? die(`${USAGE}\njudges: ${JUDGES.map((j) => j.id).join(', ')}`);
const split = values.split === 'dev' || values.split === 'test' ? values.split : die(USAGE);
const pairs = readLabels(labelPath(judge.id), judge.id).pairs.filter((p) => p.split === split);
const labelled = pairs.filter((p) => p.label !== null && p.why);
if (labelled.length === 0)
  die(`no labelled ${split} pairs in ${labelPath(judge.id)}: label some first (pnpm eval:draw)`);
const leaks = exampleLeaks(
  judge,
  pairs.filter((p) => p.split === 'test'),
);
if (leaks.length > 0)
  die(
    `test pairs ${leaks.join(', ')} are examples of judge ${judge.id}: move them to dev or drop the example`,
  );

const dir = judgeReportsDir(REPO_ROOT, judge.id);
const repeat = split === 'test' && hasTestReport(judge, dir);
try {
  const login = resolveJudgeLogin();
  console.log(
    `calibrating ${judge.id} (version ${judgeVersion(judge)}) on ${labelled.length} ${split} pairs × ${RUNS}, login: ${describeLogin(login)}`,
  );
  const out = await runJudge(judge, labelled.map(toPair), { login, runs: RUNS });
  const a = agreement(pairs, out.runs);
  print(a, labelled.length);
  const path = saveReport(dir, {
    judge: judge.id,
    version: judgeVersion(judge),
    model: out.model,
    claude_code_version: out.claudeCodeVersion,
    split,
    at: new Date().toISOString(),
    runs: RUNS,
    ...a,
    repeat_test_use: repeat,
    cost: out.cost,
  });
  if (repeat)
    console.log('\nnote: the test set was used again for this wording (learning/05: once).');
  console.log(
    `\ncalibrated: ${split === 'test' && meetsBar(a) ? 'yes' : 'no'} (bar ${BAR.toFixed(2)}/${BAR.toFixed(2)}${split === 'dev' ? '; only a test run counts' : ''})` +
      `\ncost: $${out.cost.usd.toFixed(3)}, ${out.cost.calls} calls · model ${out.model}, Claude Code ${out.claudeCodeVersion}\nreport: ${path}`,
  );
} catch (e) {
  if (e instanceof JudgeSetupError) die(`judge cannot run (${e.code}): ${e.message}`);
  throw e;
}
