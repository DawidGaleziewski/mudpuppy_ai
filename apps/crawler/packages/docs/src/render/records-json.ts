import { highlightFiles, screenFiles } from './images.js';
import type { ExportModel, ExportRecord } from './model.js';

/** Recursively sort object keys; arrays keep their (already canonical) order. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value;
}

export const EXPORT_SCHEMA = 'pathfinder-srs-export/1';

/** A record's pictures with export-relative paths (spec 008 FR-021); null when it has none. */
function visualsJson(r: ExportRecord) {
  if (r.visuals.screens.length === 0) return null;
  const own = screenFiles(r);
  const highlights = highlightFiles(r);
  return {
    screens: r.visuals.screens.map((s) => ({
      state_id: s.state_id,
      title: s.title,
      route_template: s.route_template,
      screenshot: own && own.screen.state_id === s.state_id ? own.screenshot : null,
      wireframe_svg: own && own.screen.state_id === s.state_id ? own.wireframe_svg : null,
      wireframe_excalidraw:
        own && own.screen.state_id === s.state_id ? own.wireframe_excalidraw : null,
    })),
    regions: highlights.flatMap((h) =>
      h.regions.map((g) => ({
        state_id: g.state_id,
        n: g.n,
        key: g.key,
        note: g.note,
        box: g.box,
        image: g.box ? h.path : null,
      })),
    ),
  };
}

/**
 * `records.json`: the machine-readable copy of exactly what the Markdown renders: records with the
 * rendered revision, evidence, relations and review summary, plus the change log, source runs and
 * open crawler questions. Canonical: sorted keys, records by kind order then key, revisions by
 * number, two-space indent, LF, one trailing newline (FR-053).
 */
export function recordsJson(m: ExportModel): string {
  const data = {
    schema: EXPORT_SCHEMA,
    portal_id: m.portal_id,
    environment: m.environment,
    mode: m.mode,
    as_of: m.as_of,
    ...(m.scope ? { scope: m.scope } : {}),
    // To-be, never observed (FR-018): every amendment carries its status so the consuming agent
    // sees what was dropped and why (FR-023).
    ...(m.amendments ? { amendments: m.amendments.map((a) => ({ ...a, to_be: true })) } : {}),
    records: m.records.map((r) => ({
      key: r.key,
      kind: r.kind,
      title: r.title,
      rev: r.rev,
      status: r.status,
      confidence: r.confidence,
      not_observable: r.not_observable,
      baseline_rev: r.baseline_rev,
      content: r.content,
      evidence: r.evidence,
      relations: r.relations,
      review_summary: {
        confirm: r.reviews.filter((v) => v.action === 'confirm').length,
        reject: r.reviews.filter((v) => v.action === 'reject').length,
        comment: r.reviews.filter((v) => v.action === 'comment').length,
      },
      reviews: r.reviews,
      followup: r.followup,
      trace: r.trace,
      visuals: visualsJson(r),
    })),
    change_log: m.change_log,
    runs: m.runs,
    crawler_questions: m.crawler_questions,
  };
  return `${JSON.stringify(canonical(data), null, 2)}\n`;
}
