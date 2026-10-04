import { toExcalidraw } from './excalidraw.js';
import { layoutWireframe } from './model.js';
import { toSvg } from './svg.js';

export { MAX_NODES, layoutWireframe, type Prim, type WireframeModel } from './model.js';
export { toSvg, PALETTE } from './svg.js';
export { toExcalidraw } from './excalidraw.js';

/** Bumped on any visual change, so `wireframes:build` regenerates stale rows. */
export const GENERATOR_VERSION = '1';

/**
 * A recorded ARIA snapshot drawn as a low-fidelity wireframe (spec 008 R-21), as SVG and as an
 * editable Excalidraw file. Pure: the same snapshot and options give byte-identical output.
 */
export function renderWireframe(
  ariaYaml: string,
  opts: { title?: string; width?: number } = {},
): { svg: string; excalidraw: string } {
  const model = layoutWireframe(ariaYaml, opts);
  return { svg: toSvg(model), excalidraw: toExcalidraw(model) };
}
