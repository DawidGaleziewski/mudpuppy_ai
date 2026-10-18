// A screen's picture (spec 027 US1): a thumbnail ([data-picture], a link to the screen page) opens
// #picture-dialog with the large screenshot, a Screenshot / Wireframe switch and "Open screen
// page". Esc or Close shuts it and focus goes back to the thumbnail. Text comes in through
// textContent and attributes only.
(() => {
  let opener = null;
  let current = { shot: "", wire: "" };

  const dialog = () => document.getElementById("picture-dialog");

  const show = (view) => {
    const d = dialog();
    const src = current[view];
    const img = d.querySelector("[data-picture-img]");
    for (const b of d.querySelectorAll("[data-picture-view]"))
      b.setAttribute("aria-pressed", b.dataset.pictureView === view ? "true" : "false");
    img.hidden = !src;
    if (src) {
      img.src = src;
      img.alt = `${view === "shot" ? "Screenshot" : "Wireframe"} of ${d.querySelector("[data-picture-title]").textContent}`;
    }
    d.querySelector("[data-picture-none]").hidden = Boolean(src);
  };

  document.addEventListener("click", (e) => {
    const thumb = e.target.closest?.("[data-picture]");
    const d = dialog();
    if (thumb && d && typeof d.showModal === "function") {
      e.preventDefault();
      opener = thumb;
      current = { shot: thumb.dataset.shot, wire: thumb.dataset.wire };
      d.querySelector("[data-picture-title]").textContent = thumb.dataset.title;
      d.querySelector("[data-picture-route]").textContent = thumb.dataset.route;
      const scans = Number(thumb.dataset.scans || 0);
      d.querySelector("[data-picture-scans]").textContent =
        `Seen by ${scans} scan${scans === 1 ? "" : "s"}`;
      d.querySelector("[data-picture-href]").href = thumb.href;
      show(current.shot ? "shot" : "wire");
      d.showModal();
      return;
    }
    const view = e.target.closest?.("#picture-dialog [data-picture-view]");
    if (view) return show(view.dataset.pictureView);
    if (e.target.closest?.("#picture-dialog [data-picture-close]")) dialog().close();
  });

  document.addEventListener(
    "close",
    (e) => {
      if (e.target.id === "picture-dialog" && opener) {
        opener.focus();
        opener = null;
      }
    },
    true,
  );
})();
