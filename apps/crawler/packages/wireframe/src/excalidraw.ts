import { createHash } from 'node:crypto';
import type { Prim, WireframeModel } from './model.js';
import { PALETTE } from './svg.js';

/**
 * The wireframe as an editable `.excalidraw` file (Excalidraw's open JSON format, MIT). Written
 * directly, without the Excalidraw package: plain elements with every field Excalidraw stores, a
 * fixed key order, ids and seeds derived from the element key, so output is byte-stable.
 */

const STROKE = '#1e1e1e';
const FONT_HELVETICA = 2;

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

/** Fields every Excalidraw element has, in Excalidraw's own order. */
function base(p: Prim, type: string, geom: { x: number; y: number; w: number; h: number }) {
  const h = hash(`${p.key}|${p.part}`);
  return {
    id: `w-${h.slice(0, 16)}`,
    type,
    x: geom.x,
    y: geom.y,
    width: geom.w,
    height: geom.h,
    angle: 0,
    strokeColor: STROKE,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [] as string[],
    frameId: null,
    roundness: null as { type: number } | null,
    seed: parseInt(h.slice(0, 8), 16),
    version: 1,
    versionNonce: parseInt(h.slice(8, 16), 16),
    isDeleted: false,
    boundElements: null,
    updated: 0,
    link: null,
    locked: false,
    customData: { key: p.key },
  };
}

function element(p: Prim): Record<string, unknown> {
  switch (p.kind) {
    case 'rect': {
      const e = base(p, 'rectangle', { x: p.x, y: p.y, w: p.w, h: p.h });
      e.backgroundColor = p.fill && p.fill !== 'paper' ? PALETTE[p.fill] : 'transparent';
      e.strokeStyle = p.dashed ? 'dashed' : 'solid';
      e.strokeColor = p.stroke === 'frame' || p.stroke === 'fill' ? PALETTE[p.stroke] : STROKE;
      e.roundness = p.rounded ? { type: 3 } : null;
      return e;
    }
    case 'ellipse':
      return base(p, 'ellipse', { x: p.x, y: p.y, w: p.w, h: p.h });
    case 'line': {
      const e = base(p, 'line', {
        x: p.x1,
        y: p.y1,
        w: Math.abs(p.x2 - p.x1),
        h: Math.abs(p.y2 - p.y1),
      });
      return {
        ...e,
        points: [
          [0, 0],
          [p.x2 - p.x1, p.y2 - p.y1],
        ],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
      };
    }
    case 'text': {
      const w = Math.max(8, Math.round(p.text.length * p.size * 0.55));
      const h = Math.round(p.size * 1.25);
      const x = p.anchor === 'middle' ? p.x - Math.round(w / 2) : p.x;
      const e = base(p, 'text', { x, y: p.y, w, h });
      e.strokeColor = p.tone === 'muted' ? PALETTE.muted : STROKE;
      return {
        ...e,
        text: p.text,
        fontSize: p.size,
        fontFamily: FONT_HELVETICA,
        textAlign: p.anchor === 'middle' ? 'center' : 'left',
        verticalAlign: 'top',
        containerId: null,
        originalText: p.text,
        autoResize: true,
        lineHeight: 1.25,
      };
    }
  }
}

export function toExcalidraw(m: WireframeModel): string {
  const frames = m.prims.filter((p) => p.kind === 'rect' && p.part === 'frame');
  const rest = m.prims.filter((p) => !(p.kind === 'rect' && p.part === 'frame'));
  const scene = {
    type: 'excalidraw',
    version: 2,
    source: 'mudpuppy-wireframe',
    elements: [...frames, ...rest].map(element),
    appState: { viewBackgroundColor: '#ffffff', gridSize: null },
    files: {},
  };
  return `${JSON.stringify(scene, null, 2)}\n`;
}
