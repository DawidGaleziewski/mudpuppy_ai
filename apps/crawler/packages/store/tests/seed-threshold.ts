// A reconciled portal with one decision point, shared by the decision mining and process proposal
// tests (spec 039): a form submitted eleven times with different birth dates.
import type { OpenedDb } from '../src/index.js';

const H = (c: string) => c.repeat(64);
export const T = (s: number) =>
  `2026-10-19T01:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000Z`;

function blob(base: number): Buffer {
  const buf = Buffer.alloc(512);
  for (let i = 0; i < 128; i++) buf.writeUInt32BE(base * 1000 + i, i * 4);
  return buf;
}

export const SUBMIT = 'button|oblicz składkę|main>form "Dane kierowcy"|';

/** A form submitted eleven times with different birth dates: under 18 → exit page, else → price page. */
export function seedThreshold(o: OpenedDb): void {
  const r = o.raw;
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser,
       config_snapshot, status, started_at) VALUES ('run1', 'ins', 'guest', 'trace', 'sandbox', '2026-10-19',
       '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  ).run(T(0));
  const state = (id: string, route: string, base: number, keys: string[]) => {
    r.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
         stabilization, first_seen_run, created_at) VALUES (?, 'ins', ?, 'c', ?, ?, ?, 'observed', 'settled', 'run1', ?)`,
    ).run(id, H(id[0]!), route, id, `${H('e')}.yaml`, T(0));
    r.prepare(
      `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash, mounts_hash,
         minhash, element_keys) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, H(String(base)), H('c'), H('o'), H('a'), H('m'), blob(base), JSON.stringify(keys));
  };
  state('form', '/kalkulator/kierowca', 1, [SUBMIT]);
  state('exit', '/odmowa', 2, []);
  state('price', '/kalkulator/wynik', 3, []);
  const births = [
    '2010-03-01',
    '2009-11-30',
    '2012-01-15',
    '2011-06-01',
    '2010-12-24',
    '1980-05-01',
    '1990-07-07',
    '1975-02-02',
    '2000-09-09',
    '1985-04-04',
    '1999-12-12',
  ]; // fmt: skip
  births.forEach((birth, i) => {
    const j = `j${i}`;
    const at = 10 + i * 3;
    r.prepare(
      "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES (?, 'run1', 'entry_url', ?)",
    ).run(j, T(at));
    r.prepare(
      `INSERT INTO page_visits (id, run_id, state_id, edge_id, via, url, hops_json, created_at, journey_id, seq, result,
         context_key, flags_json) VALUES (?, 'run1', 'form', NULL, 'navigate', 'https://ins.test/kalkulator/kierowca', '[]', ?, ?, ?, 'ok', ?, '{}')`,
    ).run(`vf${i}`, T(at), j, i * 2 + 1, H('x'));
    r.prepare(
      `INSERT INTO attribute_writes (id, journey_id, seq, name, source, value_type, value_text, created_at)
       VALUES (?, ?, 1, 'input.data_urodzenia', 'input', 'date', ?, ?)`,
    ).run(`w${i}`, j, birth, T(at));
    const adult = Number(birth.slice(0, 4)) < 2008;
    r.prepare(
      `INSERT INTO edges (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref, confidence,
         stabilization, created_at, journey_id, seq, from_visit_id, element_key, kind, result)
       VALUES (?, 'run1', 'form', ?, '{}', 'read', 'executed', ?, 'observed', 'settled', ?, ?, 2, ?, ?, 'submit', 'ok')`,
    ).run(`e${i}`, adult ? 'price' : 'exit', `${H('e')}.yaml`, T(at + 1), j, `vf${i}`, SUBMIT);
    r.prepare(
      `INSERT INTO page_visits (id, run_id, state_id, edge_id, via, url, hops_json, created_at, journey_id, seq, result,
         context_key, flags_json) VALUES (?, 'run1', ?, ?, 'action', 'https://ins.test/next', '[]', ?, ?, ?, 'ok', ?, '{}')`,
    ).run(`vn${i}`, adult ? 'price' : 'exit', `e${i}`, T(at + 2), j, i * 2 + 2, H('x'));
  });
}
