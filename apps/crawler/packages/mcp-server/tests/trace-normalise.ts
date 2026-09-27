const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const SHA = /\b[0-9a-f]{64}\b/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const DAY = /\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * Replace ids, hashes and timestamps with `<id:n>` / `<sha:n>` / `<ts:n>` numbered by first
 * appearance, so two runs of the same script compare equal although the run ids are random.
 */
export function normaliseRows<T>(rows: T[], opts: { durations?: boolean } = {}): T[] {
  const tokens = new Map<string, string>();
  const counts = { id: 0, sha: 0, ts: 0, day: 0 };
  const token = (kind: keyof typeof counts) => (v: string) => {
    const key = `${kind}:${v}`;
    let t = tokens.get(key);
    if (!t) tokens.set(key, (t = `<${kind}:${++counts[kind]}>`));
    return t;
  };
  const text = JSON.stringify(rows)
    .replace(ISO, token('ts'))
    .replace(UUID, token('id'))
    .replace(SHA, token('sha'))
    .replace(DAY, token('day'));
  const out = JSON.parse(text) as Record<string, unknown>[];
  if (opts.durations === false)
    for (const r of out) if (r.duration_ms !== null) r.duration_ms = '<ms>';
  return out as T[];
}
