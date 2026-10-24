import { Check, Fieldset, Segmented } from '../design-system';

type Show = 'graph' | 'list';

/** What both maps' views share: their filter's layers and Graph / List. */
interface MapView<F extends { layers?: string[] | null }> {
  f: F;
  show: Show;
}

/**
 * The end of a map's filter bar, the same on the model map and a scan's recorded map (spec 076,
 * one copy): the layers to draw and the Graph / List switch.
 */
export function MapControls<F extends { layers?: string[] | null }>({
  m,
  v,
  set,
}: {
  m: { layer_options: readonly { value: string; label: string }[]; filter: { layers: string[] } };
  v: MapView<F>;
  set: (next: Partial<MapView<F>>) => void;
}) {
  const layers = m.filter.layers;
  const toggle = (layer: string, on: boolean) =>
    set({ f: { ...v.f, layers: on ? [...layers, layer] : layers.filter((l) => l !== layer) } });
  return (
    <>
      <Fieldset legend="Layers">
        {m.layer_options.map((o) => (
          <Check key={o.value} label={o.label} checked={layers.includes(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} />
        ))}
      </Fieldset>
      <Segmented
        label="Show as"
        selected={v.show}
        onSelect={(next) => set({ show: next === 'list' ? 'list' : 'graph' })}
        items={[
          { value: 'graph', label: 'Graph' },
          { value: 'list', label: 'List' },
        ]}
      />
    </>
  );
}
