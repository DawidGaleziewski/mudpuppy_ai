/* Workbench behaviour that htmx doesn't cover. Plain JS, no build step, delegated listeners so it survives swaps.
   - Why this view? / Expand toggles · point and ask (A key, Ask buttons, @ picker) · suggestions · Enter sends
   - stale stream notice + resume cursor · focus kept across out-of-band swaps · Esc / F keys · copy
   Behaviour rules: docs/14-workbench.md; component contracts: docs/16-genui-components.md. */
(function () {
  "use strict";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const typing = (el) => el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
  const MAX_CHIPS = 3;

  // ---- toggles: Why this view? and folded (older) views --------------------------------------
  function toggle(btn, open) {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (!panel) return;
    const next = open === undefined ? btn.getAttribute("aria-expanded") !== "true" : open;
    btn.setAttribute("aria-expanded", String(next));
    panel.hidden = !next;
    if (btn.hasAttribute("data-fold")) btn.textContent = next ? "Collapse" : "Expand";
  }

  // ---- point and ask -------------------------------------------------------------------------
  function readAsk(el) {
    try { return JSON.parse(el.getAttribute("data-ask")); } catch (e) { return null; }
  }

  function addChip(ask, send) {
    const bar = $("#wb-ctxbar"), input = $("#wb-input");
    if (!bar || !ask) return;
    const chips = $$(".sy-ctxchip", bar);
    if (!chips.some((c) => c.dataset.label === ask.label)) {
      if (chips.length >= MAX_CHIPS) chips[0].remove();
      const chip = document.createElement("span");
      chip.className = "sy-ctxchip";
      chip.dataset.label = ask.label;
      chip.innerHTML = '<span class="sy-ctxchip__at" aria-hidden="true">@</span><span></span>' +
        '<button class="sy-ctxchip__remove" type="button">×</button><input type="hidden" name="ctx">';
      chip.children[1].textContent = ask.label;
      chip.querySelector("button").setAttribute("aria-label", "Stop asking about " + ask.label);
      chip.querySelector("input").value = JSON.stringify(ask);
      bar.appendChild(chip);
    }
    bar.hidden = false;
    const sugg = $("#wb-suggest");
    if (sugg && ask.suggest) {
      sugg.replaceChildren(...ask.suggest.map((s) => {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.suggest = ""; b.textContent = s;
        return b;
      }));
      sugg.hidden = false;
    }
    if (send && input) { input.value = send; $("#wb-composer").requestSubmit(); return; }
    if (input) input.focus();
  }

  function clearChips() {
    const bar = $("#wb-ctxbar");
    if (!bar) return;
    $$(".sy-ctxchip", bar).forEach((c) => c.remove());
    bar.hidden = true;
  }

  // ---- @ picker: point at a page without the mouse --------------------------------------------
  function pickables() {
    const seen = new Map();
    $$("#wb-layout [data-ask]").forEach((el) => {
      const a = readAsk(el);
      if (a && !seen.has(a.label)) seen.set(a.label, a);
    });
    return Array.from(seen.values());
  }

  function openPicker() {
    if ($("#wb-composer[data-phase='1']")) return;          // phase 1: no @ picker
    const picker = $("#wb-picker");
    const items = pickables();
    if (!picker || !items.length) return;
    picker.replaceChildren(...items.map((a, i) => {
      const o = document.createElement("button");
      o.type = "button"; o.setAttribute("role", "option"); o.className = "sy-btn sy-btn--sm sy-btn--quiet";
      o.textContent = "@ " + a.label; o.dataset.pick = JSON.stringify(a);
      o.setAttribute("aria-selected", i === 0 ? "true" : "false");
      return o;
    }));
    picker.hidden = false;
  }

  function closePicker() { const p = $("#wb-picker"); if (p) p.hidden = true; }

  function movePicker(d) {
    const opts = $$("#wb-picker [role=option]");
    let i = opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
    i = Math.max(0, Math.min(opts.length - 1, i + d));
    opts.forEach((o, j) => o.setAttribute("aria-selected", j === i ? "true" : "false"));
  }

  function choosePick(opt) {
    const input = $("#wb-input");
    if (input) input.value = input.value.replace(/@$/, "");
    closePicker();
    addChip(JSON.parse(opt.dataset.pick));
  }

  // ---- clicks ----------------------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    if (t.matches(".sy-genview__why, [data-fold]")) return toggle(t);
    if (t.matches(".sy-ctxchip__remove")) {
      t.closest(".sy-ctxchip").remove();
      const bar = $("#wb-ctxbar");
      if (bar && !$(".sy-ctxchip", bar)) bar.hidden = true;
      return $("#wb-input") && $("#wb-input").focus();
    }
    if (t.matches("[data-pick]")) return choosePick(t);
    if (t.matches("[data-suggest]")) {
      const input = $("#wb-input");
      input.value = t.textContent.trim();
      return $("#wb-composer").requestSubmit();
    }
    if (t.matches("[data-copy]")) {
      const src = $(t.getAttribute("data-copy"));
      if (src && navigator.clipboard) navigator.clipboard.writeText(src.innerText).catch(() => {});
      return;
    }
    // Ask buttons (not the map nodes themselves: clicking a node selects it)
    if (t.matches("[data-ask]") && !t.matches(".sy-node, .sy-film__item")) addChip(readAsk(t), t.getAttribute("data-ask-send"));
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-follow]")) {
      const island = document.getElementById(t.getAttribute("data-follow"));
      if (island) island.setAttribute("data-follow", t.checked ? "on" : "off");
    }
  });

  // ---- keys: A asks about the focused item · @ picker · Enter sends · Esc closes · F focus mode ----
  document.addEventListener("keydown", (e) => {
    const el = document.activeElement;
    const picker = $("#wb-picker");
    if (picker && !picker.hidden && el && el.id === "wb-input") {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return movePicker(e.key === "ArrowDown" ? 1 : -1); }
      if (e.key === "Enter") { e.preventDefault(); const o = $("#wb-picker [aria-selected=true]"); return o && choosePick(o); }
      if (e.key === "Escape") { e.preventDefault(); return closePicker(); }
    }
    if (el && el.id === "wb-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (el.value.trim()) $("#wb-composer").requestSubmit();
      return;
    }
    if (e.key === "Escape") {
      const why = el && el.closest(".sy-genwhy");
      const openWhy = why ? $(`[aria-controls="${why.id}"]`) : $(".sy-genview__why[aria-expanded=true]");
      if (openWhy) { toggle(openWhy, false); openWhy.focus(); return; }
      const close = $("[data-sheet-close]");
      if (close && !typing(el)) close.click();
      return;
    }
    if (typing(el) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "a" || e.key === "A") {
      const src = el && (el.closest("[data-ask]") || (el.closest(".sy-askable") && $("[data-ask]", el.closest(".sy-askable"))));
      if (src) { e.preventDefault(); addChip(readAsk(src)); }
    } else if (e.key === "f" || e.key === "F") {
      const f = $("[data-focus-toggle]");
      if (f) f.click();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "wb-input") {
      if (e.data === "@") openPicker(); else if (!/@$/.test(e.target.value)) closePicker();
    }
  });

  // ---- composer: clear on send (values are already captured), restore the text if sending fails ----
  let lastSent = "";
  document.addEventListener("htmx:beforeRequest", (e) => {
    if (e.detail.elt && e.detail.elt.id === "wb-composer") {
      const input = $("#wb-input");
      lastSent = input.value;
      input.value = "";
      clearChips();
      closePicker();
    }
  });
  ["htmx:responseError", "htmx:sendError"].forEach((n) => document.addEventListener(n, (e) => {
    if (e.detail.elt && e.detail.elt.id === "wb-composer" && lastSent) $("#wb-input").value = lastSent;
  }));

  // ---- stream: resume after a hard reconnect, stale notice ---------------------------------------
  // The browser resends Last-Event-ID on its own reconnects. After a hard close the htmx sse extension creates a NEW
  // EventSource, which forgets it, so we append ?last_event_id= ourselves (docs/17 §5.4).
  let lastId = null, lastAt = Date.now();
  htmx.createEventSource = (url) =>
    new EventSource(lastId ? url + (url.includes("?") ? "&" : "?") + "last_event_id=" + encodeURIComponent(lastId) : url,
                    { withCredentials: true });

  function setStale(on) {
    $$(on ? ".sy-genview[data-live]" : ".sy-genview[data-gen-state=stale]").forEach((v) => {
      if (on && v.dataset.genState === "stale") return;
      v.dataset.genState = on ? "stale" : "ready";
      if (on) {
        const n = $("#wb-stale-tpl").content.firstElementChild.cloneNode(true);
        $("[data-at]", n).textContent = ($("#wb-last-at") || {}).textContent || "the last event";
        v.querySelector(".sy-genview__head").after(n);
      } else {
        $$("[data-stale-notice]", v).forEach((n) => n.remove());
      }
    });
  }

  document.addEventListener("htmx:sseMessage", (e) => {
    lastAt = Date.now();
    if (e.detail && e.detail.lastEventId) lastId = e.detail.lastEventId;
  });
  document.addEventListener("htmx:sseError", () => setStale(true));
  document.addEventListener("htmx:sseOpen", () => {
    if ($(".sy-genview[data-gen-state=stale]")) {
      setStale(false);
      const a = $("#wb-announce");
      if (a) a.textContent = "Live updates back.";
    }
  });
  setInterval(() => { if ($("#wb-live[sse-connect]") && Date.now() - lastAt > 30000) setStale(true); }, 5000);

  // ---- focus and scroll survive out-of-band swaps ----------------------------------------------
  // The log sticks to the bottom only while the person hasn't scrolled up to read (judged on their own scrolling,
  // not on DOM moves: a preserved element can lose its scroll position when the layout around it is swapped).
  let keep = null, pinned = true;
  const nearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  ["wheel", "touchmove", "keydown"].forEach((n) => document.addEventListener(n, (e) => {
    const log = e.target.closest && e.target.closest("#wb-log");
    if (log) requestAnimationFrame(() => { pinned = nearBottom(log); });
  }, { passive: true }));
  document.addEventListener("htmx:oobBeforeSwap", () => {
    const a = document.activeElement;
    if (a && a.id && a !== document.body) keep = a.id;
  });
  document.addEventListener("htmx:oobAfterSwap", () => {
    const log = $("#wb-log");
    if (log && pinned) log.scrollTop = log.scrollHeight;
    if (keep && (document.activeElement === document.body || !document.activeElement)) {
      const el = document.getElementById(keep);
      if (el) el.focus({ preventScroll: true });
    }
  });

  // Leaving the page: close the stream through htmx (no error event, no reconnect attempt).
  // The sse extension closes its EventSource on htmx:beforeCleanupElement.
  const closeStream = () => { const live = $("#wb-live"); if (live) htmx.trigger(live, "htmx:beforeCleanupElement"); };
  window.addEventListener("beforeunload", closeStream);
  window.addEventListener("pagehide", closeStream);
  document.addEventListener("DOMContentLoaded", () => {
    const log = $("#wb-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
})();
