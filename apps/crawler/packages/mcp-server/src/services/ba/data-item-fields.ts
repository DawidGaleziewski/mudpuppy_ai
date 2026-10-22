import type { DocContent } from '@mudpuppy/docs-model';
import type { BaContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import { json } from './common.js';

/**
 * One data item per form field (spec 019 F-13/F-16). In four reference trials the BA joined fields
 * of one form into a single data item ("Data wyjazdu / Data powrotu", "Login / Hasło"), which the
 * skill and the tool description both forbade. A rule on the name alone would refuse real labels
 * with commas or slashes, so the check uses what the crawler observed: the labels of the forms the
 * data item cites. A name holding two or more of them is refused, naming the fields.
 */

type Field = { name?: unknown; label?: unknown };

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Fields whose technical `name` the data item uses where the field shows another label (spec 034
 * F-21: one trial named 14 of 19 data items `rok_produkcji`, `zgoda_dane / zgoda_owu`, …, so they
 * matched no label). The name is split on `/`, `,` and `;`, so a joined name is caught too. The
 * match is exact, case included: a radio group's own label "Zakres" is not its options' name
 * `zakres` (each option carries its own label).
 */
export function technicalNamesUsed(name: string, fields: readonly Field[]): Field[] {
  const parts = new Set(
    name
      .split(/[/,;]/)
      .map((p) => p.trim())
      .filter(Boolean),
  );
  return fields.filter(
    (f) =>
      typeof f.name === 'string' &&
      typeof f.label === 'string' &&
      f.label.trim() !== '' &&
      norm(f.name) !== norm(f.label) &&
      parts.has(f.name.trim()),
  );
}

/** Labels of `fields` that occur in `name`, a label inside a longer matched label not counted. */
export function fieldsNamed(name: string, labels: readonly string[]): string[] {
  const n = norm(name);
  const found = [...new Set(labels.filter((l) => l.trim() && n.includes(norm(l))))];
  return found.filter((l) => !found.some((o) => o !== l && norm(o).includes(norm(l))));
}

/** The form ids a data item points at: its `seen_in` forms and its form evidence. */
function citedForms(
  content: DocContent,
  evidence: readonly { target_kind: string; target_id: string }[],
) {
  const seen =
    content.kind === 'data_item'
      ? content.seen_in.filter((s) => s.kind === 'form').map((s) => s.target_id)
      : [];
  return [
    ...new Set([
      ...seen,
      ...evidence.filter((e) => e.target_kind === 'form').map((e) => e.target_id),
    ]),
  ];
}

export function assertOneFieldPerDataItem(
  ctx: BaContext,
  content: DocContent,
  evidence: readonly { target_kind: string; target_id: string }[],
): void {
  if (content.kind !== 'data_item') return;
  const read = ctx.raw.prepare('SELECT fields_json FROM forms WHERE id = ?');
  for (const formId of citedForms(content, evidence)) {
    const row = read.get(formId) as { fields_json: string } | undefined;
    if (!row) continue; // an unknown form is the evidence check's to refuse
    const fields = json<Field[]>(row.fields_json);
    const technical = technicalNamesUsed(content.name_verbatim, fields);
    if (technical.length > 0)
      throw new ToolError(
        'SCHEMA_INVALID',
        `content.name_verbatim uses the technical name of ${technical.map((f) => `"${String(f.name)}" (label "${String(f.label)}")`).join(', ')}; name_verbatim is the label exactly as the page shows it, one data_item per field`,
        { kind: 'data_item', labels: technical.map((f) => f.label), form_id: formId },
      );
    // Visible labels only: a technical field name (`data`, `typ`) would match inside real labels.
    const labels = fields.flatMap((f) => (typeof f.label === 'string' ? [f.label] : []));
    const named = fieldsNamed(content.name_verbatim, labels);
    if (named.length >= 2)
      throw new ToolError(
        'SCHEMA_INVALID',
        `content.name_verbatim names ${named.length} fields of one form (${named.map((l) => `"${l}"`).join(', ')}); write one data_item per field`,
        { kind: 'data_item', fields: named, form_id: formId },
      );
  }
}
