/**
 * `pnpm eval:draw <judge-id> --portal <portal> --store <path> [--store <path> ...]` (spec 017 US2,
 * contracts/commands.md): the judge's pairs from each store into its label file
 * (`evals/graders/human/labels/<judge-id>.yaml`), for the owner to label. Existing pairs and labels are kept.
 * No model call.
 */
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './config.js';
import { die } from './failures.js';
import { labelPath, mergePairs, readLabels, writeLabels } from './graders/human/labels.js';
import { judgeById, JUDGES } from './graders/model/judges/index.js';
import { pairsFromStore } from './graders/model/store-pairs.js';
import { loadGroundTruth, taskFor } from './tasks.js';

const USAGE =
  'usage: pnpm eval:draw <judge-id> --portal <portal> --store <path> [--store <path> ...]';
const WANTED = 40;

const { values, positionals } = (() => {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: { portal: { type: 'string' }, store: { type: 'string', multiple: true } },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    return die(`${(e as Error).message}\n${USAGE}`);
  }
})();

const judge =
  judgeById(positionals[0] ?? '') ?? die(`${USAGE}\njudges: ${JUDGES.map((j) => j.id).join(', ')}`);
const portal = values.portal ?? die(USAGE);
const stores = values.store ?? die(USAGE);
const task = taskFor(portal) ?? die(`no eval task for ${portal}`);
const groundTruth = loadGroundTruth(REPO_ROOT, task);

const path = labelPath(judge.id);
let file = readLabels(path, judge.id);
let added = 0;
let kept = 0;
for (const store of stores) {
  const abs = resolve(store);
  const source = `${relative(REPO_ROOT, abs)}#${portal}`;
  const found = await pairsFromStore(judge, abs, portal, groundTruth).catch((e: Error) =>
    die(e.message),
  );
  const merged = mergePairs(file, found.pairs, source);
  file = merged.file;
  added += merged.added;
  kept += merged.kept;
  console.log(`${source}: ${found.records} records, ${found.pairs.length} pairs`);
}
writeLabels(path, file);

const count = (f: (p: (typeof file.pairs)[number]) => boolean) => file.pairs.filter(f).length;
console.log(
  `${relative(process.cwd(), path)}: added ${added}, kept ${kept}; ` +
    `dev ${count((p) => p.split === 'dev')} / test ${count((p) => p.split === 'test')}, ` +
    `labelled ${count((p) => p.label !== null)} of ${file.pairs.length}`,
);
if (file.pairs.length < WANTED)
  console.log(
    `${WANTED - file.pairs.length} pairs short of ${WANTED}: draw from another store (a trial's ` +
      'workspace) or add pairs with source: hand-made for the tricky cases.',
  );
