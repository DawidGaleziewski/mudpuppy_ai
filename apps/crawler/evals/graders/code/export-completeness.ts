/**
 * The rebuild-grade export of a trial's documentation (spec 034 R-68, FR-016): every documented
 * process is exported the way `pnpm docs:process-export` does, and the folder is scored. Code-based,
 * no tokens. Diagnostics of how usable the documentation is to a rebuild team, not goal scores
 * against the ground truth (the docs categories are those).
 *
 * - `export_steps_pictured`: process steps whose export shows a screenshot of the step.
 * - `export_records_once`: the process's requirements, rules and NFRs that appear exactly once in
 *   the file of their kind (business rules in BUSINESS_REQUIREMENTS.md, requirements and NFRs in
 *   FUNCTIONAL_REQUIREMENTS.md).
 * - `export_ears`: of those records, the ones the BA gave an EARS statement (owner answer 2 of
 *   2026-10-16: the BA writes it while documenting).
 * - `export_fields_documented`: form fields on the process's steps that a data item documents.
 * - `export_steps_distinct`: steps whose page (route, and form step on a same-URL wizard) no other
 *   step of the same process has (owner review
 *   2026-10-17: a page shown twice is a variant or an error state the export failed to fold).
 */
import { exportProcess, loadProcessExport, processKeys } from '@pathfinder/docs';
import type { RawDb } from '../../queries.js';

export interface Score {
  matched: number;
  total: number;
  pct: number;
}

export interface ExportScores {
  export_steps_pictured: Score;
  export_records_once: Score;
  export_ears: Score;
  export_fields_documented: Score;
  export_steps_distinct: Score;
}

/** An empty denominator scores 0, never 100 % (create-eval §7). */
const score = (matched: number, total: number): Score => ({
  matched,
  total,
  pct: total === 0 ? 0 : Math.round((1000 * matched) / total) / 10,
});

const FILE_OF: Record<string, string> = {
  business_rule: 'BUSINESS_REQUIREMENTS.md',
  requirement: 'FUNCTIONAL_REQUIREMENTS.md',
  nfr: 'FUNCTIONAL_REQUIREMENTS.md',
};

const count = (text: string, needle: string): number => text.split(needle).length - 1;

export function scoreExport(
  db: RawDb,
  portal: string,
  opts: { environment: string; evidenceRoot?: string },
): ExportScores {
  const tally = { pictured: [0, 0], once: [0, 0], ears: [0, 0], fields: [0, 0], distinct: [0, 0] };
  for (const key of processKeys(db, portal)) {
    const model = loadProcessExport(db, portal, key, opts);
    const files = exportProcess(db, portal, key, opts);
    if (model === null || files === null) continue;
    // A page is its route and, on a same-URL wizard, its form step.
    const page = (s: (typeof model.steps)[number]) =>
      `${s.step.route_template}|${s.step.states[0]?.form_step?.index ?? ''}`;
    const pages = model.steps.map(page);
    for (const s of model.steps) {
      tally.distinct[1]! += 1;
      if (pages.filter((p) => p === page(s)).length === 1) tally.distinct[0]! += 1;
    }
    for (const s of model.steps.filter((x) => !x.step.also_cited)) {
      tally.pictured[1]! += 1;
      const shown = s.step.states.some((x, i) =>
        files.has(`images/step-${s.step.n}-${i + 1}-${x.kind}.png`),
      );
      if (shown) tally.pictured[0]! += 1;
      for (const f of s.fields) {
        tally.fields[1]! += 1;
        if (f.data_item !== null) tally.fields[0]! += 1;
      }
    }
    for (const r of model.srs.records.filter((x) => FILE_OF[x.kind] !== undefined)) {
      tally.once[1]! += 1;
      tally.ears[1]! += 1;
      const text = files.get(FILE_OF[r.kind]!) as string;
      if (count(text, `id="${r.key.toLowerCase()}"`) === 1 || count(text, `| ${r.key} |`) === 1)
        tally.once[0]! += 1;
      if (typeof (r.content.ears as { text?: unknown } | undefined)?.text === 'string')
        tally.ears[0]! += 1;
    }
  }
  return {
    export_steps_pictured: score(tally.pictured[0]!, tally.pictured[1]!),
    export_records_once: score(tally.once[0]!, tally.once[1]!),
    export_ears: score(tally.ears[0]!, tally.ears[1]!),
    export_fields_documented: score(tally.fields[0]!, tally.fields[1]!),
    export_steps_distinct: score(tally.distinct[0]!, tally.distinct[1]!),
  };
}
