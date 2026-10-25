// The rules pass's coverage (spec 045, R-89): over the 2.0 trials the BA wrote 6–8 of 17 rules,
// because it kept the portal's validation messages and limit hints only as data item constraints
// (F-59@039). When the BA records the `rules` or the `synthesis` pass, the server lists what the
// session's forms say about their limits (a probe's validation message, a validation screen's
// alert, a hint next to a field) that no business rule states yet, as a warning: the BA writes a
// rule for each before going on. Approach A of R-89 (owner, 2026-10-22).

import { readFileSync } from 'node:fs';
import type { BaContext } from '../../context.js';
import { json } from './common.js';

/** Something a page says about a limit, and the field it is about when the page shows one. */
export interface RuleCandidate {
  text: string;
  field: string | null;
  route: string;
  source: 'message' | 'hint' | 'sweep';
  /** A hint tied to no control: the form's controls, so the rule can quote the one it is about. */
  controls?: string[];
  /** The numbers a rule must give, when not every number of the text (a sweep's band edge). */
  numbers?: string[];
}

const LIST_CAP = 30;
const TEXT_MIN = 6;
const TEXT_MAX = 240;

/**
 * The browser's own "fill this in" messages: they only repeat that a field is required, which the
 * data item already says (Chromium's English and Polish wording).
 */
const REQUIRED_ONLY =
  /please (fill out|fill in|select an item|select one of|check this box)|wypełnij to pole|zaznacz to pole|wybierz (element|jedną)/i;

/** Lowercase, one space, digit groups joined ("500 000" → "500000") and decimal commas as dots. */
export const normText = (s: string): string =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/(\d)\s(?=\d{3}\b)/g, '$1') // \s covers the no-break space too
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .replace(/[.!:;\s]+$/, '')
    .trim();

/** Standalone numbers only: the 10 of "WIOSNA10" is part of an example, not a limit. */
const numbersOf = (s: string): string[] =>
  normText(s).match(/(?<![\p{L}\d])\d+(?:\.\d+)?(?![\p{L}\d])/gu) ?? [];

/** Words that say a rule is about a field's format, for a message that gives no number. */
const FORMAT_WORDS = /format|pattern|wzór|wzorzec|regex|\[0-9\]|\\d/;

interface Field {
  label?: unknown;
}

const CONTROL =
  /^(\s*)- (textbox|combobox|spinbutton|checkbox|radio|listbox|slider|searchbox) "(.+?)"/;
const TEXT_LINE = /^(\s*)- (text|paragraph|note|status): ?"?(.+?)"?$/;
const ALERT_LINE = /^\s*- alert(?::\s*|\s+")(.+?)"?:?\s*$/;

/** A text line of the right length that is neither a control's label nor repeats its field. */
function hintOfLine(
  line: string,
  field: string | null,
  labels: ReadonlySet<string>,
): RuleCandidate | null {
  const text = TEXT_LINE.exec(line)?.[3]?.trim();
  if (!text || text.length < TEXT_MIN || text.length > TEXT_MAX) return null;
  if (labels.has(normText(text)) || (field !== null && normText(field) === normText(text)))
    return null;
  return { text, field, route: '', source: 'hint' };
}

/**
 * The hints of one form's snapshot: text lines inside `main` that are not a control's own label.
 * A text line that follows a control among the same parent's children is about that control.
 */
export function hintsOf(snapshot: string, labels: ReadonlySet<string>): RuleCandidate[] {
  const out: RuleCandidate[] = [];
  let mainIndent: number | null = null;
  const lastControl = new Map<number, string>(); // indent → the last control's label
  const controls: string[] = [];
  for (const line of snapshot.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (mainIndent === null) {
      if (/^\s*- main:/.test(line)) mainIndent = indent;
      continue;
    }
    if (line.trim() && indent <= mainIndent) break; // left main
    for (const i of [...lastControl.keys()]) if (i > indent) lastControl.delete(i);
    const control = CONTROL.exec(line);
    if (control) {
      lastControl.set(indent, control[3]!);
      if (!controls.includes(control[3]!)) controls.push(control[3]!);
      continue;
    }
    const hint = hintOfLine(line, lastControl.get(indent) ?? null, labels);
    if (hint) out.push(hint);
  }
  // A free hint that names one control is about it ("AC dostępne tylko …" names "OC + Autocasco
  // (AC)", R-97 (2)); else every control of the page, also those after the hint ("Wybierz dwa
  // różne produkty" comes first).
  return out.map((h) => {
    if (h.field !== null || controls.length === 0) return h;
    const named = controlNamedBy(h.text, controls);
    return named === null ? { ...h, controls } : { ...h, field: named };
  });
}

const ACRONYM = /\b\p{Lu}{2,5}\b/gu;
const LONG_WORD = /[\p{L}]{6,}/gu;

/**
 * The one control a hint names: by an acronym of its label (matched case and all), else by a
 * long word of its label (six letters or more, any case). Null when none or several match.
 */
export function controlNamedBy(text: string, controls: readonly string[]): string | null {
  const wordsOf = (s: string, re: RegExp, fold: boolean) =>
    new Set((s.match(re) ?? []).map((w) => (fold ? w.toLowerCase() : w)));
  for (const [re, fold] of [
    [ACRONYM, false],
    [LONG_WORD, true],
  ] as const) {
    const inHint = wordsOf(text, re, fold);
    const hits = controls.filter((c) => [...wordsOf(c, re, fold)].some((w) => inHint.has(w)));
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) return null;
  }
  return null;
}

/** Validation messages of the session's probes, minus the browser's required-only wording. */
function probeMessages(ctx: BaContext, sessionId: string): RuleCandidate[] {
  const rows = ctx.raw
    .prepare(
      `SELECT p.messages_json, s.route_template AS route FROM probe_outcomes p
       JOIN analysis_session_runs r ON r.run_id = p.run_id
       JOIN states s ON s.id = p.from_state_id
       WHERE r.session_id = ? AND p.outcome_kind = 'validation'`,
    )
    .all(sessionId) as { messages_json: string; route: string }[];
  const out: RuleCandidate[] = [];
  for (const row of rows)
    for (const m of json<{ field?: unknown; text?: unknown }[]>(row.messages_json)) {
      if (typeof m.text !== 'string' || REQUIRED_ONLY.test(m.text)) continue;
      out.push({
        text: m.text,
        field: typeof m.field === 'string' ? m.field : null,
        route: row.route,
        source: 'message',
      });
    }
  return out;
}

const readSnapshot = (ctx: BaContext, ref: string): string | null => {
  try {
    return readFileSync(ctx.evidence.resolve(ref), 'utf8');
  } catch {
    return null; // a missing snapshot is the evidence reads' concern
  }
};

/** Alerts on the validation states of the session's runs (a trace that hit a server message). */
function validationAlerts(ctx: BaContext, sessionId: string): RuleCandidate[] {
  const rows = ctx.raw
    .prepare(
      `SELECT DISTINCT o.evidence_ref, s.route_template AS route FROM state_observations o
       JOIN analysis_session_runs r ON r.run_id = o.run_id
       JOIN states s ON s.id = o.state_id
       WHERE r.session_id = ? AND s.state_kind = 'validation'`,
    )
    .all(sessionId) as { evidence_ref: string; route: string }[];
  const out: RuleCandidate[] = [];
  for (const row of rows) {
    const text = readSnapshot(ctx, row.evidence_ref);
    if (text === null) continue;
    for (const line of text.split('\n')) {
      const alert = ALERT_LINE.exec(line)?.[1]?.trim();
      if (alert && alert.length >= TEXT_MIN && !REQUIRED_ONLY.test(alert))
        out.push({ text: alert, field: null, route: row.route, source: 'message' });
    }
  }
  return out;
}

/** The hints next to the fields of the session's forms. */
function formHints(ctx: BaContext, sessionId: string): RuleCandidate[] {
  const rows = ctx.raw
    .prepare(
      `SELECT f.fields_json, f.evidence_ref, s.route_template AS route FROM forms f
       JOIN analysis_session_runs r ON r.run_id = f.run_id
       JOIN states s ON s.id = f.state_id
       WHERE r.session_id = ?`,
    )
    .all(sessionId) as { fields_json: string; evidence_ref: string; route: string }[];
  const out: RuleCandidate[] = [];
  for (const row of rows) {
    const snapshot = readSnapshot(ctx, row.evidence_ref);
    if (snapshot === null) continue;
    const labels = new Set(
      json<Field[]>(row.fields_json)
        .map((f) => f.label)
        .filter((l): l is string => typeof l === 'string')
        .map(normText),
    );
    for (const h of hintsOf(snapshot, labels)) out.push({ ...h, route: row.route });
  }
  return out;
}

/**
 * Band edges input sweeps found on the portal (spec 080, R-97 (4), `pnpm model:sweep`): a rule
 * states one when it names the field and both numbers of the edge. Portal-wide, since the sweep's
 * probe runs are not runs a session documents.
 */
function sweepBands(ctx: BaContext, sessionId: string): RuleCandidate[] {
  const rows = ctx.raw
    .prepare(
      `SELECT d.reason, d.detail_json, s.route_template AS route FROM decision_log d
       JOIN runs r ON r.id = d.run_id
       JOIN analysis_sessions a ON a.portal_id = r.portal_id
       LEFT JOIN states s ON s.id = (SELECT o.state_id FROM observations o WHERE o.run_id = d.run_id
         ORDER BY o.created_at DESC, o.id DESC LIMIT 1)
       WHERE a.id = ? AND d.rule = 'input_band'`,
    )
    .all(sessionId) as { reason: string; detail_json: string; route: string | null }[];
  return rows.map((r) => {
    const band = json<{ label?: unknown; below?: unknown; above?: unknown }>(r.detail_json);
    return {
      text: r.reason,
      field: typeof band.label === 'string' ? band.label : null,
      route: r.route ?? '?',
      source: 'sweep' as const,
      numbers: [String(band.below), String(band.above)],
    };
  });
}

/** Every candidate of the session once (same text, field and route). */
export function ruleCandidates(ctx: BaContext, sessionId: string): RuleCandidate[] {
  const seen = new Map<string, RuleCandidate>();
  for (const c of [
    ...probeMessages(ctx, sessionId),
    ...validationAlerts(ctx, sessionId),
    ...formHints(ctx, sessionId),
    ...sweepBands(ctx, sessionId),
  ]) {
    const key = `${c.route}|${normText(c.field ?? '')}|${normText(c.text)}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

/** The texts of the portal's live business rules: title, statement and EARS text. */
function ruleTexts(ctx: BaContext, portalId: string): string[] {
  const rows = ctx.raw
    .prepare(
      `SELECT v.content_json FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.portal_id = ? AND r.kind = 'business_rule' AND r.withdrawn = 0`,
    )
    .all(portalId) as { content_json: string }[];
  return rows.map(({ content_json }) => {
    const c = json<{ title?: unknown; statement?: unknown; ears?: { text?: unknown } }>(
      content_json,
    );
    return normText(
      [c.title, c.statement, c.ears?.text].filter((t) => typeof t === 'string').join(' '),
    );
  });
}

/**
 * A rule states a candidate when it quotes its text (and, for a hint, the label of its control or,
 * tied to none, one of the form's controls), or names the candidate's field and every number it gives ("Rok
 * produkcji" and 1990 for "Value must be … 1990"), or, for a message with no number, names the
 * field and its format ("Please match the requested format.").
 */
export function isStated(c: RuleCandidate, rules: readonly string[]): boolean {
  const text = normText(c.text);
  const numbers = c.numbers ?? numbersOf(c.text);
  const field = c.field ? normText(c.field) : null;
  const controls = (c.controls ?? []).map(normText);
  const namesControl = (r: string) => controls.length === 0 || controls.some((l) => r.includes(l));
  // A hint's rule names the control it is about: the grader anchors a rule on its label (R-97 (2)).
  const namesField = (r: string) => c.source !== 'hint' || field === null || r.includes(field);
  return rules.some(
    (r) =>
      (r.includes(text) && namesControl(r) && namesField(r)) ||
      (numbers.length > 0 &&
        (field === null ? namesControl(r) : r.includes(field)) &&
        numbers.every((n) => numbersOf(r).includes(n))) ||
      (numbers.length === 0 &&
        field !== null &&
        c.source === 'message' &&
        r.includes(field) &&
        FORMAT_WORDS.test(r)),
  );
}

const shown = (c: RuleCandidate): string => {
  let about = '';
  if (c.field) about = ` (${c.field})`;
  else if (c.controls) about = ` (about one of: ${c.controls.map((l) => `"${l}"`).join(', ')})`;
  return `"${c.text}"${about} on ${c.route}`;
};

/** The warning for a `rules` or `synthesis` pass that left limits without a rule; none when complete. */
export function rulePassWarnings(ctx: BaContext, sessionId: string, portalId: string): string[] {
  const rules = ruleTexts(ctx, portalId);
  const missing = ruleCandidates(ctx, sessionId).filter((c) => !isStated(c, rules));
  if (missing.length === 0) return [];
  const list =
    missing.slice(0, LIST_CAP).map(shown).join('; ') +
    (missing.length > LIST_CAP ? ` and ${String(missing.length - LIST_CAP)} more` : '');
  return [
    `${String(missing.length)} limit(s) the pages state have no business_rule yet: ${list}. A data item's constraint does not replace the rule: write one business_rule each (quote the text and the label of the control it is about exactly, give its ears form, cite the form or the probe outcome's state; inferred when only the hint says it), or say in the synthesis gaps why one is not a rule.`,
  ];
}
