/**
 * Whom to scan (spec 024 US4, spec 046 FR-009): instead of every imported user, one persona per
 * distinct combination of attributes, and the pairs among them that differ in exactly one
 * attribute (what rule R4 and the access matrix compare best). Pure.
 */

export interface SamplePersona {
  id: string;
  attributes: Readonly<Record<string, unknown>>;
}

export interface PersonaSample {
  /** One persona per distinct attribute combination: the first by id. */
  chosen: { id: string; combination: Record<string, string>; stands_for: string[] }[];
  /** Chosen personas that differ in exactly one attribute. */
  pairs: { a: string; b: string; attribute: string }[];
  /** Personas left out: another persona has the same attributes. */
  left_out: string[];
}

const valueOf = (v: unknown): string =>
  Array.isArray(v) ? (v as unknown[]).map(String).sort().join('|') : String(v);

const byId = (a: SamplePersona, b: SamplePersona): number =>
  Number(a.id > b.id) - Number(a.id < b.id);

/** The attributes as text, every attribute any persona has (missing → ""). */
function combinationOf(p: SamplePersona, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((k) => [k, k in p.attributes ? valueOf(p.attributes[k]) : '']),
  );
}

export function samplePersonas(personas: readonly SamplePersona[]): PersonaSample {
  const keys = [...new Set(personas.flatMap((p) => Object.keys(p.attributes)))].sort();
  const groups = new Map<string, { combination: Record<string, string>; ids: string[] }>();
  for (const p of [...personas].sort(byId)) {
    const combination = combinationOf(p, keys);
    const key = JSON.stringify(combination);
    const g = groups.get(key) ?? { combination, ids: [] };
    g.ids.push(p.id);
    groups.set(key, g);
  }
  const chosen = [...groups.values()].map((g) => ({
    id: g.ids[0]!,
    combination: g.combination,
    stands_for: g.ids.slice(1),
  }));
  const pairs: PersonaSample['pairs'] = [];
  for (let i = 0; i < chosen.length; i++)
    for (let j = i + 1; j < chosen.length; j++) {
      const diff = keys.filter((k) => chosen[i]!.combination[k] !== chosen[j]!.combination[k]);
      if (diff.length === 1)
        pairs.push({ a: chosen[i]!.id, b: chosen[j]!.id, attribute: diff[0]! });
    }
  return { chosen, pairs, left_out: chosen.flatMap((c) => c.stands_for) };
}
