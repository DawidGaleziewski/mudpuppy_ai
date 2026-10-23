// The components added for the portal map (spec 053): Graph, GraphNode, Legend, Bundle, ViewNav,
// Fieldset, SubHead and Text's link.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Bundle, Check, Fieldset, Graph, GraphNode, Legend, SubHead, Text, ViewNav } from '../src/design-system';

/** jsdom lays nothing out: give a node its box, for the arrow keys. */
function boxAt(el: HTMLElement, x: number, y: number) {
  el.getBoundingClientRect = () => ({ left: x, top: y, width: 10, height: 10 }) as DOMRect;
}

function twoNodes(onSelect = vi.fn()) {
  render(
    <Graph label="Map of shop now" width={400} height={200} edges={[{ d: 'M0 0 L10 10', state: 'unseen', label: 'age ≥ 18', labelX: 5, labelY: 5 }]}>
      <GraphNode id="a" x={0} y={0} near={['b']} route="/" title="Home" pressed onSelect={onSelect} />
      <GraphNode id="b" x={0} y={160} near={['a']} route="/kalkulator" title="Kalkulator" />
      <GraphNode id="f" x={200} y={160} route="/oferta/…" title="14 screens" href="?open=/oferta" />
    </Graph>,
  );
}

describe('Graph', () => {
  it('draws the edges in their state, nodes as buttons, a folded family as a link', () => {
    const onSelect = vi.fn();
    twoNodes(onSelect);
    const map = screen.getByRole('region', { name: 'Map of shop now' });
    expect(map.querySelector('path')?.getAttribute('class')).toBe('sy-edge sy-edge--unseen');
    expect(screen.getByText('age ≥ 18').tagName.toLowerCase()).toBe('text');
    const home = screen.getByRole('button', { name: /Home/ });
    expect(home.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(home);
    expect(onSelect).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /14 screens/ }).className).toContain('sy-node--deck');
  });

  it('zooms by the designer steps from its floating bar and its keys (Q4)', () => {
    twoNodes();
    const home = screen.getByRole('button', { name: /Home/ });
    const canvas = home.parentElement!;
    const bar = screen.getByRole('toolbar', { name: 'Zoom the map' });
    expect(bar.className).toBe('sy-graph__zoom');
    expect(bar.parentElement!.className).toBe('sy-graphview');
    expect(bar.getAttribute('aria-controls')).toBe(screen.getByRole('region', { name: 'Map of shop now' }).id);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(canvas.style.zoom).toBe('1.25');
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(canvas.style.zoom).toBe('0.25');
    expect(screen.getByText('Zoom 25%')).toBeTruthy(); // said once, in the live region
    expect(screen.getByRole('button', { name: 'Zoom 25%, overview, reset to 100%' })).toBeTruthy();
    fireEvent.keyDown(home, { key: '0' });
    expect(canvas.style.zoom).toBe('1');
    fireEvent.keyDown(home, { key: '+' });
    expect(screen.getByRole('button', { name: 'Zoom 125%, reset to 100%' })).toBeTruthy();
    const fit = screen.getByRole('button', { name: 'Fit' });
    expect(fit.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(fit);
    expect(fit.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(fit.getAttribute('aria-pressed')).toBe('false');
  });

  it('is capped at 520 px inside another page', () => {
    render(
      <Graph label="Scan graph" width={100} height={100} edges={[]} embedded>
        <GraphNode id="a" x={0} y={0} route="/" title="Home" />
      </Graph>,
    );
    expect(screen.getByRole('toolbar').parentElement!.className).toBe('sy-graphview sy-graphview--embedded');
  });

  it('moves the focus to the neighbour an arrow key points at', () => {
    twoNodes();
    const home = screen.getByRole('button', { name: /Home/ });
    const calc = screen.getByRole('button', { name: /Kalkulator/ });
    boxAt(home, 0, 0);
    boxAt(calc, 0, 160);
    home.focus();
    fireEvent.keyDown(home, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(calc);
    fireEvent.keyDown(calc, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(calc); // nothing further down
  });
});

describe('Legend, Bundle, ViewNav, Fieldset, SubHead, Text link', () => {
  it('names what each piece is for', () => {
    render(
      <>
        <Legend label="Link states" items={[{ state: '', label: 'Active' }, { state: 'unseen', label: 'Not seen since' }]} />
        <Bundle label="Bundled links">Menu on every page</Bundle>
        <ViewNav label="Screens views" items={[{ href: '/l', label: 'List', count: 3 }, { href: '/m', label: 'Map', current: true }]} />
        <Fieldset legend="Layers">
          <Check label="Not checked" />
        </Fieldset>
        <SubHead>Variants · 2</SubHead>
        <Text route href="/x">
          /oferta/…
        </Text>
      </>,
    );
    expect(screen.getByRole('list', { name: 'Link states' }).querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Bundled links' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'List 3' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('group', { name: 'Layers' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Variants · 2' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '/oferta/…' }).className).toBe('sy-route');
  });
});

describe('Graph, round 3 (spec 072)', () => {
  it('opens a big map readable at 80 %, not fitted; Fit draws an overview where a click zooms in (Q3)', () => {
    // jsdom lays nothing out: a 400 px box for a 2000 px map fits at 18 %
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    try {
      const onSelect = vi.fn();
      render(
        <Graph label="Map of shop now" width={2000} height={400} edges={[]}>
          <GraphNode id="a" x={0} y={0} route="/" title="Home" onSelect={onSelect} />
        </Graph>,
      );
      const map = screen.getByRole('region', { name: 'Map of shop now' });
      const home = screen.getByRole('button', { name: /Home/ });
      expect(home.parentElement!.style.zoom).toBe('0.8');
      expect(map.className).toBe('sy-graph');
      const fit = screen.getByRole('button', { name: 'Fit' });
      expect(fit.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(fit);
      expect(home.parentElement!.style.zoom).toBe('0.184');
      expect(map.className).toBe('sy-graph sy-graph--overview');
      fireEvent.click(home);
      expect(onSelect).toHaveBeenCalled();
      expect(home.parentElement!.style.zoom).toBe('1');
      expect(map.className).toBe('sy-graph');
    } finally {
      width.mockRestore();
    }
  });

  it('puts an arrowhead on a move off the tree, both ends when it went both ways (Q1)', () => {
    const { container } = render(
      <>
        <Graph label="Map" width={100} height={100} edges={[{ d: 'M0 0H9', state: 'offtree', arrow: 'end', label: '↩ step 4', labelX: 4, labelY: 2 }, { d: 'M0 9H9', state: 'offtree', arrow: 'both' }, { d: 'M0 5H9', state: 'tree' }]}>
          <GraphNode id="a" x={0} y={0} route="/" title="Home" />
        </Graph>
        <Legend label="Moves" items={[{ state: 'tree', label: 'First visit' }, { state: 'offtree', label: 'Move off the tree' }]} />
      </>,
    );
    const marker = container.querySelector('.sy-graph marker');
    const url = `url(#${marker?.id ?? ''})`;
    const [end, both, tree] = [...container.querySelectorAll('.sy-graph path.sy-edge')];
    expect(end?.getAttribute('marker-end')).toBe(url);
    expect(end?.hasAttribute('marker-start')).toBe(false);
    expect(both?.getAttribute('marker-start')).toBe(url);
    expect(tree?.hasAttribute('marker-end')).toBe(false);
    expect(screen.getByText('↩ step 4').tagName.toLowerCase()).toBe('text');
    const legendMarker = container.querySelector('.sy-legend marker');
    expect(legendMarker && legendMarker.id !== marker?.id).toBe(true);
  });
});
