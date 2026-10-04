import type { Prim, Tone, WireframeModel } from './model.js';

/** Fixed palette (contracts/wireframe-format.md); the wireframe never follows a page's colours. */
export const PALETTE: Record<Tone, string> = {
  ink: '#1F2328',
  muted: '#6E7781',
  line: '#8C959F',
  fill: '#F6F8FA',
  frame: '#D0D7DE',
  paper: '#FFFFFF',
};

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function prim(p: Prim): string {
  switch (p.kind) {
    case 'rect':
      return (
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"` +
        (p.rounded ? ' rx="6"' : '') +
        ` fill="${p.fill ? PALETTE[p.fill] : 'none'}" stroke="${PALETTE[p.stroke]}" stroke-width="1"` +
        (p.dashed ? ' stroke-dasharray="4 3"' : '') +
        '/>'
      );
    case 'ellipse': {
      const rx = Math.round(p.w / 2);
      const ry = Math.round(p.h / 2);
      return `<ellipse cx="${p.x + rx}" cy="${p.y + ry}" rx="${rx}" ry="${ry}" fill="${PALETTE.paper}" stroke="${PALETTE[p.stroke]}" stroke-width="1"/>`;
    }
    case 'line':
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${PALETTE[p.stroke]}" stroke-width="1"/>`;
    case 'text':
      return (
        `<text x="${p.x}" y="${p.y + p.size}" font-size="${p.size}"` +
        (p.bold ? ' font-weight="600"' : '') +
        (p.anchor === 'middle' ? ' text-anchor="middle"' : '') +
        ` fill="${PALETTE[p.tone]}">${escapeXml(p.text)}</text>`
      );
  }
}

/**
 * The wireframe as a standalone SVG: no scripts, no external references, every node in a
 * `<g data-key>` so a cited element key can be found (FR-017). Byte-stable for a given model.
 */
export function toSvg(m: WireframeModel): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" viewBox="0 0 ${m.width} ${m.height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`,
    `<title>${escapeXml(m.title ? `Wireframe: ${m.title}` : 'Wireframe')}</title>`,
    `<rect x="0" y="0" width="${m.width}" height="${m.height}" fill="${PALETTE.paper}"/>`,
  ];
  // Frames are drawn first (behind their contents); otherwise prims keep their document order.
  const ordered = [
    ...m.prims.filter((p) => p.kind === 'rect' && p.part === 'frame'),
    ...m.prims.filter((p) => !(p.kind === 'rect' && p.part === 'frame')),
  ];
  let open: string | null = null;
  for (const p of ordered) {
    if (p.key !== open) {
      if (open !== null) out.push('</g>');
      out.push(`<g data-key="${escapeXml(p.key)}">`);
      open = p.key;
    }
    out.push(prim(p));
  }
  if (open !== null) out.push('</g>');
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}
