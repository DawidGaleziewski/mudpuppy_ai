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

  // Confirm dialogs (FE-T01 Revoke): a button with data-dialog opens that <dialog>, names the
  // target in its [data-dialog-name] spots and points its form at data-action. Esc closes it
  // natively; focus returns to the button.
  document.addEventListener("click", (e) => {
    const opener = e.target.closest?.("[data-dialog]");
    if (opener) {
      const dlg = document.getElementById(opener.dataset.dialog);
      if (!dlg) return;
      dlg.querySelectorAll("[data-dialog-name]").forEach((n) => {
        n.textContent = opener.dataset.name ?? "";
      });
      const form = dlg.querySelector("[data-dialog-form]");
      if (form && opener.dataset.action) form.action = opener.dataset.action;
      dlg.addEventListener("close", () => opener.focus(), { once: true });
      dlg.showModal();
      return;
    }
    if (e.target.closest?.("[data-dialog-close]")) e.target.closest("dialog")?.close();
  });

  // A table that scrolls sideways must be reachable by keyboard (WCAG 2.1.1, axe
  // scrollable-region-focusable): its wrapper becomes focusable while it overflows. htmx swaps
  // regions in, so this runs again after every swap.
  const focusableScrollers = (root) => {
    root.querySelectorAll?.(".sy-table-wrap").forEach((w) => {
      if (w.scrollWidth > w.clientWidth + 1) {
        w.tabIndex = 0;
        if (!w.hasAttribute("aria-label")) w.setAttribute("aria-label", "Table, scrolls sideways");
      } else w.removeAttribute("tabindex");
    });
  };
  focusableScrollers(document);
  window.addEventListener("resize", () => focusableScrollers(document));
  document.body.addEventListener("htmx:afterSwap", (e) => focusableScrollers(e.target));

  // The portal menu closes when focus or a click leaves it.
  document.addEventListener("click", (e) => {
    const menu = document.querySelector(".mp-portal-menu[open]");
    if (menu && !menu.contains(e.target)) menu.open = false;
  });
})();
