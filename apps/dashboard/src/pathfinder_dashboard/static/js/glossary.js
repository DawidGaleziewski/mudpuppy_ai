// Glossary page (spec 006): filter entries as you type. Without JS the same filter is a GET form.
(() => {
  const input = document.querySelector("[data-gl-filter]");
  if (!input) return;
  const entries = [...document.querySelectorAll("[data-gl-text]")];
  const groups = [...document.querySelectorAll("[data-gl-group]")];
  const none = document.querySelector("[data-gl-none]");

  const apply = () => {
    const needle = input.value.trim().toLowerCase();
    let shown = 0;
    for (const e of entries) {
      e.hidden = needle !== "" && !e.dataset.glText.includes(needle);
      if (!e.hidden) shown += 1;
    }
    for (const g of groups) g.hidden = !g.querySelector("[data-gl-text]:not([hidden])");
    if (none) none.hidden = shown > 0;
  };

  input.addEventListener("input", apply);
  // Enter keeps the server round trip, so the filtered view stays a shareable URL.
})();
