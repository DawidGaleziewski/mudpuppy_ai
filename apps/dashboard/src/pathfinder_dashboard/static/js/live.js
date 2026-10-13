// Live-connection status, stale banner and dev reload (research §3, §5). No framework.
(() => {
  const statusEl = document.getElementById("live-status");
  const banner = document.getElementById("stale");
  const dev = document.body.dataset.dev === "1";
  let bootId = null;

  // Salvage Yard pages (spec 022) show shape + word; Console pages keep their bracket label.
  const salvage = document.body.classList.contains("sy-ground");
  const setStatus = (live) => {
    if (statusEl && salvage) {
      statusEl.innerHTML = live
        ? '<span class="sy-status" data-status="live">Live</span>'
        : '<span class="sy-status" data-status="failed">Stale</span>';
    } else if (statusEl) {
      statusEl.innerHTML = live
        ? '<span class="st st-ok">[LIVE]</span> live'
        : '<span class="st st-fail">[FAIL]</span> stale';
    }
    if (banner) banner.hidden = live;
  };

  document.addEventListener("htmx:sse:after:connection", () => setStatus(true));
  document.addEventListener("htmx:sse:error", () => setStatus(false));
  document.addEventListener("htmx:sse:close", (e) => {
    if (e.detail?.reason !== "removed") setStatus(false);
  });

  // First `hello` sets the boot id; a later one with another id means the server restarted.
  document.addEventListener("hello", (e) => {
    let data = {};
    try {
      data = JSON.parse(e.detail?.data ?? "{}");
    } catch {
      return;
    }
    setStatus(true);
    if (bootId === null) bootId = data.boot_id;
    else if (dev && data.boot_id !== bootId) location.reload();
  });

  // Environment switch: submit on change (the form still works without JS via its button).
  document.querySelectorAll("select[data-autosubmit]").forEach((select) => {
    select.addEventListener("change", () => select.form.requestSubmit());
  });
})();
