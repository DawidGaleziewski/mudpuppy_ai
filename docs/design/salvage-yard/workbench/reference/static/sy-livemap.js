/* <sy-livemap> — a small Web Component "island" around the server-rendered LiveMap.
   The server renders every node; this only adds what HTML can't:
   - follow the crawler: after each stream update, scroll the crawler's node into view inside the map (not the page)
   - arrow keys move between pages in visit order (Home / End jump to first / last)
   It never renders data and never talks to the server. Remove it and the map still works (click, Tab, A). */
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

class SyLivemap extends HTMLElement {
  static get observedAttributes() { return ["data-follow"]; }

  connectedCallback() {
    this.observer = new MutationObserver(() => this.follow());
    this.observer.observe(this, { childList: true, subtree: true });
    this.addEventListener("keydown", (e) => this.onKey(e));
    this.follow();
  }

  disconnectedCallback() { if (this.observer) this.observer.disconnect(); }

  attributeChangedCallback() { this.follow(); }

  get items() {
    return Array.from(this.querySelectorAll("[data-order]")).sort((a, b) => a.dataset.order - b.dataset.order);
  }

  follow() {
    if (this.dataset.follow !== "on") return;
    const items = this.items;
    const here = this.querySelector('[data-state="here"]') || items[items.length - 1];
    const box = this.querySelector(".sy-graph, .sy-film");
    if (!here || !box) return;
    const b = box.getBoundingClientRect(), r = here.getBoundingClientRect();
    const dx = r.right > b.right ? r.right - b.right + 16 : (r.left < b.left ? r.left - b.left - 16 : 0);
    const dy = r.bottom > b.bottom ? r.bottom - b.bottom + 16 : (r.top < b.top ? r.top - b.top - 16 : 0);
    if (dx || dy) box.scrollBy({ left: dx, top: dy, behavior: reduce.matches ? "auto" : "smooth" });
  }

  onKey(e) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" };
    if (!(e.key in keys)) return;
    const items = this.items;
    const i = items.indexOf(e.target.closest("[data-order]"));
    if (i < 0) return;
    e.preventDefault();
    const k = keys[e.key];
    const next = k === "first" ? 0 : k === "last" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + k));
    items[next].focus();
  }
}

customElements.define("sy-livemap", SyLivemap);
