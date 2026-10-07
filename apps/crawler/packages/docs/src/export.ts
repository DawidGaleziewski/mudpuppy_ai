import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { imageFiles } from './render/images.js';
import type { RawDb } from './keys.js';
import { introduction, readme } from './render/chapters/front.js';
import { assumptionsAndQuestions, changeLog, unknowns } from './render/chapters/open.js';
import {
  businessRules,
  dataDictionary,
  glossary,
  nonFunctional,
  requirements,
} from './render/chapters/statements.js';
import { capabilities, processes, screens } from './render/chapters/structure.js';
import { loadExportModel, type ExportModel } from './render/model.js';
import { recordsJson } from './render/records-json.js';
import { traceability } from './render/traceability.js';
import { applyScope, type ExportScope } from './scope.js';
import { loadAmendments, supersededAmendments, toBeAmendments } from './render/amendments.js';

/** Refusals of the operator export command; kept apart from `DocsError`, which the BA tools map. */
export class ExportError extends Error {
  constructor(
    readonly code: 'NO_RECORDS' | 'OUT_DIR_NOT_EXPORT',
    message: string,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface ExportOptions {
  /** Environment label the store belongs to (one SQLite file per environment). */
  environment: string;
  /** Render only confirmed revisions (FR-051). Default: all, drafts marked. */
  confirmedOnly?: boolean;
  /**
   * The evidence store (`data/evidence`): screenshots, layouts and wireframes are read from it into
   * `images/` (spec 008 US4). Without it the export has no pictures.
   */
  evidenceRoot?: string;
  /** Keep only records whose evidence lies on these states (R-30 process scope). */
  scope?: ExportScope;
}

const RENDERERS: readonly [string, (m: ExportModel) => string][] = [
  ['README.md', readme],
  ['01-introduction.md', introduction],
  ['02-capabilities.md', capabilities],
  ['03-screens.md', screens],
  ['04-processes-and-use-cases.md', processes],
  ['05-functional-requirements.md', requirements],
  ['06-business-rules.md', businessRules],
  ['07-data-dictionary.md', dataDictionary],
  ['08-glossary.md', glossary],
  ['09-non-functional.md', nonFunctional],
  ['10-assumptions-and-questions.md', assumptionsAndQuestions],
  ['11-unknowns.md', unknowns],
  ['12-traceability.md', traceability],
  ['appendix-change-log.md', changeLog],
  ['records.json', recordsJson],
];

/**
 * Render a portal's SRS (contracts/srs-export.md) as file name → content, in a fixed order. Pure
 * apart from reading the store: no wall-clock time, so the same store gives byte-identical files
 * (FR-053). Throws `ExportError('NO_RECORDS')` when the portal has no documentation records.
 */
export function exportSrs(
  raw: RawDb,
  portalId: string,
  opts: ExportOptions,
): Map<string, string | Uint8Array> {
  const count = (
    raw.prepare('SELECT count(*) AS n FROM doc_records WHERE portal_id = ?').get(portalId) as {
      n: number;
    }
  ).n;
  if (count === 0)
    throw new ExportError('NO_RECORDS', `portal ${portalId} has no documentation records`);
  const loaded = loadExportModel(raw, portalId, {
    environment: opts.environment,
    mode: opts.confirmedOnly ? 'confirmed' : 'all',
    ...(opts.evidenceRoot ? { evidenceRoot: opts.evidenceRoot } : {}),
  });
  const scoped = opts.scope ? applyScope(raw, loaded, opts.scope) : loaded;
  // To-be amendments (R-30): own files and records.json section, only when there are any.
  const inScope = opts.scope ? new Set(opts.scope.stateIds) : null;
  const amendments = loadAmendments(raw, portalId).filter(
    (a) =>
      inScope === null ||
      a.target_kind === 'evidence' ||
      inScope.has(a.target_kind === 'wireframe_element' ? a.target_id.split('#')[0]! : a.target_id),
  );
  const model = amendments.length > 0 ? { ...scoped, amendments } : scoped;
  const files = new Map<string, string | Uint8Array>(
    RENDERERS.map(([file, render]) => [file, render(model)]),
  );
  if (model.amendments) {
    files.set('13-to-be-amendments.md', toBeAmendments(portalId, model.amendments));
    files.set('appendix-superseded-amendments.md', supersededAmendments(model.amendments));
  }
  if (opts.evidenceRoot) {
    const images = imageFiles(model, opts.evidenceRoot);
    for (const path of [...images.keys()].sort()) files.set(path, images.get(path)!);
  }
  return files;
}

/** True when `dir` is missing, empty, or holds a previous export (`records.json` + `README.md`). */
export function isReplaceableExportDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  if (!statSync(dir).isDirectory()) return false;
  const entries = readdirSync(dir);
  return (
    entries.length === 0 || (entries.includes('records.json') && entries.includes('README.md'))
  );
}

/**
 * Write the files to `dir`, replacing a previous export there. Refuses
 * (`ExportError('OUT_DIR_NOT_EXPORT')`) and deletes nothing when `dir` exists and is neither empty
 * nor an earlier export.
 */
export function writeExport(dir: string, files: Map<string, string | Uint8Array>): void {
  if (!isReplaceableExportDir(dir))
    throw new ExportError(
      'OUT_DIR_NOT_EXPORT',
      `${dir} exists and is not an earlier SRS export (no records.json and README.md); refusing to replace it`,
    );
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of files) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}
