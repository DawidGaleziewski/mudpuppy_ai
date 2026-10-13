// Salvage Yard shell behaviour (spec 022 FE-N05; docs/design/salvage-yard/docs/05-css-guide.md §8).
// Ctrl/⌘ K focuses search; Ctrl/⌘ J toggles the assistant drawer (or opens the assistant page
// when this page has no drawer); Esc closes the drawer and the portal menu and returns focus.
(() => {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  if (mac) {
    document.querySelectorAll(".sy-kbd[data-kbd]").forEach((k) => {
      k.textContent = `⌘${k.dataset.kbd}`;
    });
  }

  const ask = document.getElementById("ask-assistant");
  const drawer = () => document.getElementById("assistant");
  let returnFocus = null;

  const openDrawer = (d) => {
    returnFocus = document.activeElement;
    d.hidden = false;
    ask?.setAttribute("aria-expanded", "true");
    document.querySelector(".sy-nav")?.classList.add("sy-nav--compact");
    d.querySelector("textarea, input:not([type=hidden])")?.focus();
  };
  const closeDrawer = (d) => {
    d.hidden = true;
    ask?.setAttribute("aria-expanded", "false");
    document.querySelector(".sy-nav")?.classList.remove("sy-nav--compact");
    (returnFocus || ask)?.focus();
  };
  const toggleAssistant = () => {
    const composer = document.querySelector("[data-home-composer]");
    if (composer) return composer.focus(); // Home: the assistant is the page
    const d = drawer();
    if (!d) {
      if (ask) location.href = ask.href;
      return;
    }
    if (d.hidden) openDrawer(d);
    else closeDrawer(d);
  };

  ask?.addEventListener("click", (e) => {
    if (!drawer()) return; // no drawer on this page: follow the link
    e.preventDefault();
    toggleAssistant();
  });

  document.addEventListener("keydown", (e) => {
    const mod = mac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "k") {
      e.preventDefault();
      document.querySelector(".sy-search input")?.focus();
    } else if (mod && key === "j") {
      e.preventDefault();
      toggleAssistant();
    } else if (e.key === "Escape") {
      const menu = document.querySelector(".mp-portal-menu[open]");
      if (menu) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
        return;
      }
      const d = drawer();
      if (d && !d.hidden) closeDrawer(d);
    }
  });

  // The portal menu closes when focus or a click leaves it.
  document.addEventListener("click", (e) => {
    const menu = document.querySelector(".mp-portal-menu[open]");
    if (menu && !menu.contains(e.target)) menu.open = false;
  });
})();
