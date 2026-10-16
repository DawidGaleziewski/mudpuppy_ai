// SC-06 (field C-3, C-4): an SPA list re-renders its role-less tiles every second (new nodes, a new
// order), so a DOM path captured when the page was observed points at another tile, or at nothing,
// when the click comes; and one tile ignores clicks for its first 8 s (still "settling"). The
// harness must click the tile it means, by its text, and give a slow role-less tile time.

import { html, page } from '../page.js';
import type { Handler, Scar } from '../types.js';

const TILES = ['Policies', 'Claims', 'Invoices', 'Documents'] as const;
const slug = (s: string) => s.toLowerCase();

const script = `<script>
var names = ${JSON.stringify(TILES)};
function render() {
  var list = document.getElementById('tiles');
  var order = names.slice().sort(function () { return Math.random() - 0.5; });
  list.innerHTML = '';
  order.forEach(function (n) {
    var d = document.createElement('a');
    d.className = 'tile';
    d.textContent = n;
    d.style.cursor = 'pointer';
    d.onclick = function () { location.href = '/sc06/' + n.toLowerCase(); };
    list.appendChild(d);
  });
}
render();
setInterval(render, 1000);
var slow = document.getElementById('slow');
setTimeout(function () { slow.style.pointerEvents = 'auto'; }, 8000);
</script>`;

const leaf =
  (title: string): Handler =>
  (_req, res) =>
    html(res, page(title, `<p>${title} overview.</p><a href="/sc06/">Back</a>`));

export const sc06: Scar = {
  id: 'SC-06',
  entry: '/sc06/',
  routes: {
    '/sc06/': (_req, res) =>
      html(
        res,
        page(
          'Customer area',
          `<div id="tiles"></div>
<a id="slow" class="tile" style="cursor:pointer;pointer-events:none" onclick="location.href='/sc06/reports'">Reports</a>
${script}`,
        ),
      ),
    ...Object.fromEntries(TILES.map((t) => [`/sc06/${slug(t)}`, leaf(t)])),
    '/sc06/reports': leaf('Reports'),
  },
};
