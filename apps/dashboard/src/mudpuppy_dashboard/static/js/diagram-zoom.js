// Pan and zoom for rendered diagrams (spec 020 US4, R-19): large maps are drawn to fit their box
// and become too small to read. Works on the SVG's viewBox, so the drawing stays sharp at any
// zoom. Drag moves; Ctrl/⌘ + wheel or a trackpad/touch pinch zooms around the pointer; a plain
// wheel zooms only after the diagram was clicked (so the page still scrolls past it); the
// toolbar has zoom in, zoom out and fit. `diagrams.js` calls `attach` after each render.
(() => {
  const MIN_ZOOM = 0.25; // zoomed out: a quarter of the fitted size
  const MAX_ZOOM = 20;
  const STEP = 1.5;

  // A plain wheel zooms only the diagram the reader chose (the last one clicked inside).
  let activeFigure = null;
  document.addEventListener("pointerdown", (e) => {
    const figure = e.target instanceof Element ? e.target.closest("figure.diagram") : null;
    if (activeFigure && activeFigure !== figure) activeFigure.classList.remove("diagram-active");
    activeFigure = figure && figure.dataset.zoom === "on" ? figure : null;
    if (activeFigure) activeFigure.classList.add("diagram-active");
  });

  const button = (label, text) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn diagram-zoom-btn";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.textContent = text;
    return b;
  };

  const attach = (figure) => {
    const svg = figure.querySelector("svg");
    if (!svg || figure.dataset.zoom === "on") return;
    const base = svg.viewBox && svg.viewBox.baseVal;
    if (!base || !base.width || !base.height) return;
    figure.dataset.zoom = "on";

    const drawing = { x: base.x, y: base.y, w: base.width, h: base.height };
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    // Height follows the drawing's own proportions, capped in CSS; Mermaid's inline max-width
    // (the natural width) stays, so a small diagram is not blown up.
    svg.style.aspectRatio = `${drawing.w} / ${drawing.h}`;
    svg.removeAttribute("height");
    svg.classList.add("diagram-zoomable");
    // A drawing shrunk hard to fit (a long left-to-right map) would leave a box too flat to zoom
    // into: it gets a minimum height instead (CSS), and zooming fills it.
    if (svg.getBoundingClientRect().width < drawing.w * 0.6) svg.classList.add("diagram-squeezed");

    // The whole drawing, padded to the element's proportions so the viewBox always matches the
    // box: zooming then fills the box instead of keeping a flat strip.
    const fitted = () => {
      const r = svg.getBoundingClientRect();
      const aspect = r.width && r.height ? r.height / r.width : drawing.h / drawing.w;
      if (drawing.h / drawing.w < aspect) {
        const h = drawing.w * aspect;
        return { x: drawing.x, y: drawing.y - (h - drawing.h) / 2, w: drawing.w, h };
      }
      const w = drawing.h / aspect;
      return { x: drawing.x - (w - drawing.w) / 2, y: drawing.y, w, h: drawing.h };
    };
    const home = fitted();
    let vb = { ...home };
    const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    apply();

    // Screen px per SVG unit (the viewBox matches the box, so x and y scale alike).
    const scale = () => svg.getBoundingClientRect().width / vb.w || 1;

    const zoomAt = (factor, clientX, clientY) => {
      const zoom = home.w / (vb.w / factor);
      if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) return;
      const r = svg.getBoundingClientRect();
      const s = scale();
      const px = vb.x + (clientX - r.left) / s;
      const py = vb.y + (clientY - r.top) / s;
      vb = { x: px - (px - vb.x) / factor, y: py - (py - vb.y) / factor, w: vb.w / factor, h: vb.h / factor };
      apply();
    };
    const zoomCentre = (factor) => {
      const r = svg.getBoundingClientRect();
      zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
    };
    const fit = () => {
      vb = fitted();
      apply();
    };

    const bar = document.createElement("div");
    bar.className = "diagram-zoom";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Diagram zoom");
    const zin = button("Zoom in", "+");
    const zout = button("Zoom out", "−");
    const zfit = button("Fit to view", "fit");
    zin.addEventListener("click", () => zoomCentre(STEP));
    zout.addEventListener("click", () => zoomCentre(1 / STEP));
    zfit.addEventListener("click", fit);
    bar.append(zin, zout, zfit);
    figure.insertBefore(bar, svg.parentElement === figure ? svg : svg.parentElement);

    svg.addEventListener(
      "wheel",
      (e) => {
        if (activeFigure !== figure && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
      },
      { passive: false },
    );

    // Drag to pan; two pointers pinch to zoom.
    const pointers = new Map();
    let pinch = 0;
    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.classList.add("dragging");
    });
    svg.addEventListener("pointermove", (e) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        return;
      }
      const s = scale();
      vb = { ...vb, x: vb.x - (e.clientX - last.x) / s, y: vb.y - (e.clientY - last.y) / s };
      apply();
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) svg.classList.remove("dragging");
    };
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);

    // Keyboard: the figure is focusable; + / − / 0 work while it has focus.
    figure.tabIndex = 0;
    figure.addEventListener("keydown", (e) => {
      if (e.target !== figure) return;
      if (e.key === "+" || e.key === "=") zoomCentre(STEP);
      else if (e.key === "-") zoomCentre(1 / STEP);
      else if (e.key === "0") fit();
      else return;
      e.preventDefault();
    });
  };

  window.pfDiagramZoom = { attach };
})();
