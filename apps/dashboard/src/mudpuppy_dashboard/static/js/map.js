// The map (spec 033 FR-009, screen 12): nodes are buttons; a click or Enter selects one (htmx loads
// its inspector), arrow keys move along the discovery tree (`data-near`), and the zoom control
// scales the canvas. The server placed every node; nothing here lays out.
(() => {
  const MIN = 0.3;
  const MAX = 1.6;
  const STEP = 1.25;

  // Open on the start screen (the top row) or the selected node: a wide tree would otherwise
  // open on its empty left corner.
  const reveal = (map) => {
    const nodes = [...map.querySelectorAll(".sy-node")];
    const target =
      map.querySelector('.sy-node[aria-pressed="true"], .sy-node[aria-current="true"]') ||
      nodes.reduce((a, b) => (b.offsetTop < a.offsetTop ? b : a), nodes[0]);
    if (target) map.scrollLeft = target.offsetLeft + target.offsetWidth / 2 - map.clientWidth / 2;
  };
  document.addEventListener("DOMContentLoaded", () => {
    for (const map of document.querySelectorAll("[data-map]")) reveal(map);
  });

  // A scan's graph (spec 035) is swapped whole by htmx when a screen is picked or the store
  // changes: keep its scroll, zoom and the focused screen link (same screen, same position among
  // that screen's links) instead of jumping back to the start.
  let kept = null;
  document.addEventListener("htmx:before:swap", () => {
    const map = document.querySelector("[data-map]");
    if (!map) return;
    const focused = document.activeElement?.closest?.("[data-screen]");
    const same = focused
      ? [...document.querySelectorAll(`[data-screen="${CSS.escape(focused.dataset.screen)}"]`)]
      : [];
    kept = {
      left: map.scrollLeft,
      top: map.scrollTop,
      scale: map.querySelector(".mp-map-canvas")?.style.getPropertyValue("--mp-map-scale"),
      screen: focused?.dataset.screen,
      index: same.indexOf(focused),
    };
  });
  document.addEventListener("htmx:after:swap", () => {
    const map = document.querySelector("[data-map]");
    if (!map || !kept) return;
    if (kept.scale) map.querySelector(".mp-map-canvas")?.style.setProperty("--mp-map-scale", kept.scale);
    map.scrollLeft = kept.left;
    map.scrollTop = kept.top;
    if (kept.screen) {
      const same = document.querySelectorAll(`[data-screen="${CSS.escape(kept.screen)}"]`);
      same[Math.max(kept.index, 0)]?.focus({ preventScroll: true });
    }
    kept = null;
  });

  const select = (node) => {
    const map = node.closest("[data-map]");
    for (const n of map.querySelectorAll("button.sy-node[aria-pressed]"))
      n.setAttribute("aria-pressed", n === node ? "true" : "false");
  };

  document.addEventListener("click", (e) => {
    const node = e.target instanceof Element ? e.target.closest("[data-map] button.sy-node") : null;
    if (node) select(node);
  });

  // The neighbour that lies most in the arrow's direction.
  const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  document.addEventListener("keydown", (e) => {
    const dir = DIRS[e.key];
    const node = e.target instanceof Element ? e.target.closest("[data-map] .sy-node") : null;
    if (!dir || !node) return;
    const map = node.closest("[data-map]");
    const [x, y] = centre(node);
    let best = null;
    let bestScore = -Infinity;
    for (const id of (node.dataset.near || "").split(" ").filter(Boolean)) {
      const other = map.querySelector(`[data-screen="${CSS.escape(id)}"]`);
      if (!other) continue;
      const [ox, oy] = centre(other);
      const along = (ox - x) * dir[0] + (oy - y) * dir[1];
      if (along <= 0) continue;
      const score = along - Math.abs((ox - x) * dir[1] + (oy - y) * dir[0]);
      if (score > bestScore) [best, bestScore] = [other, score];
    }
    if (best) {
      e.preventDefault();
      best.focus();
      best.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });

  document.addEventListener("click", (e) => {
    const button = e.target instanceof Element ? e.target.closest("[data-map] [data-zoom]") : null;
    if (!button) return;
    const map = button.closest("[data-map]");
    const canvas = map.querySelector(".mp-map-canvas");
    const now = Number(canvas.style.getPropertyValue("--mp-map-scale") || 1);
    let next = now;
    if (button.dataset.zoom === "in") next = now * STEP;
    else if (button.dataset.zoom === "out") next = now / STEP;
    else next = map.clientWidth / canvas.offsetWidth;
    canvas.style.setProperty("--mp-map-scale", String(Math.min(MAX, Math.max(MIN, next))));
  });
})();
