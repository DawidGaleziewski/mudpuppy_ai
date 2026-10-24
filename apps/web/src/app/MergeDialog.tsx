import { useEffect, useState } from 'react';
import { Button, Choice, Cluster, Dialog, Facts, Field, Input, Select, Split, Stack, SubHead, Text, Textarea } from '../design-system';
import type { Target } from './api-processes';
import { useWrite, writes } from './api-write';
import { postForPlan, type WriteResult } from './state/http';

/** What the server says a merge will do (`process-merge.ts` MergePlan). */
interface MergePlan {
  keep: { key: string; name: string; persona: string; steps: number; models: string[] };
  absorb: { key: string; name: string; persona: string; steps: number; models: string[] };
  name: string;
  scope: { states: string[]; from_absorbed: string[]; off_path: string[] };
  starts: string[];
  ends: string[];
  as_is_rev: number;
  moves: { model_id: string; from_label: string; to_label: string }[];
  /** The absorbed process's PROC record, which gets a "merged into" note for the BA (spec 079). */
  record?: string | null;
}

const DIFFERENT = "Processes for different personas can't be merged: compare them instead.";

/** The server's dry run for the chosen pair, read again whenever the choice changes. */
function usePlan(portal: string, keep: string, absorb: string | null, name: string, start: string, end: string) {
  const [got, setGot] = useState<{ for: string; plan: MergePlan | null; message: string | null } | null>(null);
  const asked = JSON.stringify([keep, absorb, name, start, end]);
  useEffect(() => {
    if (!absorb) return;
    let live = true;
    void postForPlan<MergePlan>(writes.merge(portal, { keep, absorb, ...(name && { name }), ...(start && { start }), ...(end && { end }), dry_run: true })).then((r) => {
      if (live) setGot({ for: asked, plan: r.ok ? r.value : null, message: r.ok ? null : r.message });
    });
    return () => {
      live = false;
    };
  }, [portal, keep, absorb, name, start, end, asked]);
  return got?.for === asked ? got : null;
}

function PlanFacts({ p, titleOf }: { p: MergePlan; titleOf: (s: string) => string }) {
  const extra = p.scope.from_absorbed.map(titleOf);
  return (
    <Facts
      items={[
        ['Persona', `${p.keep.persona} in both ✓`],
        ['Scope', `${String(p.scope.states.length + p.scope.off_path.length)} screens: the ${String(p.keep.steps)} of ${p.keep.name}${extra.length ? ` + ${extra.join(', ')} from ${p.absorb.name}` : ''}`],
        ['As-is', `Rebuilt from what scans observed → A r${String(p.as_is_rev)}. No hand edits${p.scope.off_path.length ? `; ${String(p.scope.off_path.length)} not on the observed path yet` : ''}`],
        ['To-be', p.moves.length ? p.moves.map((m) => `${p.absorb.name}'s ${m.from_label} moves over as ${m.to_label}, marked "branched from another as-is"`).join('; ') : `${p.absorb.name} has no to-be model`],
        ...(p.record ? [['Docs', `${p.record} gets a note "merged into ${p.keep.key}" for the BA to revise or withdraw`] as const] : []),
        ['Undo', 'Undo for 10 s; later, Split back on the process page'],
      ]}
    />
  );
}

export interface MergeDialogProps {
  portal: string;
  /** The two to choose between (from the list: the two ticked; from a process page: it and the one picked). */
  first: Target;
  candidates: readonly Target[];
  second?: Target | undefined;
  onClose: () => void;
  /** After the merge: its answer (the message, the merge's id for Undo). */
  onDone: (r: WriteResult) => void;
  titleOf: (state: string) => string;
}

/**
 * Merge two processes (designer T-06, v2-20, D-70): keep which (default: the one you started
 * from), name, start and end when they differ, a reason; the facts are the server's dry run for
 * the pair. The primary button names the result. Same persona only: another persona's process is
 * offered disabled with the reason.
 */
/** Which process to merge with (from a process page), and which of the two to keep. */
function PairPick({ first, candidates, second, other, setOther, keepFirst, setKeepFirst }: { first: Target; candidates: readonly Target[]; second: Target | undefined; other: string; setOther: (v: string) => void; keepFirst: boolean; setKeepFirst: (k: boolean) => void }) {
  const pair = candidates.find((c) => c.id === other);
  const facts = (t: Target) => `${t.key} · ${t.persona} · ${String(t.steps)} steps`;
  return (
    <Stack>
      {!second && (
        <Field label="Merge with">
          <Select value={other} onChange={(e) => setOther(e.target.value)}>
            <option value="">Pick a process</option>
            {candidates
              .filter((c) => c.id !== first.id)
              .map((c) => (
                <option key={c.id} value={c.id} disabled={c.persona !== first.persona}>
                  {`${c.name} · ${facts(c)}${c.persona !== first.persona ? ' (another persona)' : ''}`}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {pair && pair.persona !== first.persona && <Text block>{DIFFERENT}</Text>}
      {pair && (
        <>
          <Choice name="keep" value="first" checked={keepFirst} onChange={() => setKeepFirst(true)} label={`Keep ${first.name}`} what={facts(first)} />
          <Choice name="keep" value="second" checked={!keepFirst} onChange={() => setKeepFirst(false)} label={`Keep ${pair.name}`} what={facts(pair)} />
        </>
      )}
    </Stack>
  );
}

interface Chosen {
  name: string;
  start: string;
  end: string;
  reason: string;
}

/** The plan's choices (name, start, end, reason) and its facts. */
function PlanPart({ p, c, set, titleOf }: { p: MergePlan; c: Chosen; set: (next: Partial<Chosen>) => void; titleOf: (s: string) => string }) {
  return (
    <>
      <Field label="Name">
        <Input value={c.name || p.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Cluster>
        {p.starts.length > 1 && <EndPick label="Start" value={c.start} options={p.starts} set={(start) => set({ start })} titleOf={titleOf} />}
        {p.ends.length > 1 && <EndPick label="End" value={c.end} options={p.ends} set={(end) => set({ end })} titleOf={titleOf} />}
      </Cluster>
      <PlanFacts p={p} titleOf={titleOf} />
      <Field label="Reason (optional)">
        <Textarea value={c.reason} onChange={(e) => set({ reason: e.target.value })} rows={2} />
      </Field>
    </>
  );
}

/** The primary button names the result: "Merge into Oblicz składkę OC/AC". */
const mergeLabel = (c: Chosen, p: MergePlan | null, keep: Target | undefined) => `Merge into ${c.name || p?.name || keep?.name || ''}`;

const given = (c: Chosen) => ({ ...(c.name && { name: c.name }), ...(c.start && { start: c.start }), ...(c.end && { end: c.end }) });

export function MergeDialog({ portal, first, candidates, second, onClose, onDone, titleOf }: MergeDialogProps) {
  const [other, setOther] = useState(second?.id ?? '');
  const [keepFirst, setKeepFirst] = useState(true);
  const [c, setC] = useState<Chosen>({ name: '', start: '', end: '', reason: '' });
  const write = useWrite(['portals', portal, 'processes']);
  const pair = candidates.find((x) => x.id === other);
  const [keep, absorb] = keepFirst ? [first, pair] : [pair, first];
  const plan = usePlan(portal, keep?.id ?? first.id, absorb?.id ?? null, c.name, c.start, c.end);
  const p = plan?.plan ?? null;
  const merge = () => {
    if (keep && absorb) write.mutate(writes.merge(portal, { keep: keep.id, absorb: absorb.id, ...given(c), ...(c.reason && { reason: c.reason }) }), { onSuccess: onDone });
  };
  return (
    <Dialog open onClose={onClose} label="Merge 2 processes">
      <Dialog.Head>
        <Split>
          <SubHead section>Merge 2 processes</SubHead>
          <Dialog.Close />
        </Split>
      </Dialog.Head>
      <Dialog.Body>
        <Stack>
          <PairPick first={first} candidates={candidates} second={second} other={other} setOther={setOther} keepFirst={keepFirst} setKeepFirst={setKeepFirst} />
          {p && <PlanPart p={p} c={c} set={(next) => setC({ ...c, ...next })} titleOf={titleOf} />}
          {plan?.message && <Text block>{plan.message}</Text>}
        </Stack>
      </Dialog.Body>
      <Dialog.Foot>
        <Cluster>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!p} busy={write.isPending} onClick={merge}>
            {mergeLabel(c, p, keep)}
          </Button>
        </Cluster>
      </Dialog.Foot>
    </Dialog>
  );
}

function EndPick({ label, value, options, set, titleOf }: { label: string; value: string; options: string[]; set: (v: string) => void; titleOf: (s: string) => string }) {
  return (
    <Field label={label}>
      <Select value={value || options[0]} onChange={(e) => set(e.target.value)}>
        {options.map((s) => (
          <option key={s} value={s}>
            {titleOf(s)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
