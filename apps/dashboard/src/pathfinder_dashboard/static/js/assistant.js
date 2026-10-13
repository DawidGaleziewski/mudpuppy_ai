// The assistant on Salvage Yard pages (spec 022 M3; screens 01–03, FE-A01–A08). One script for
// Home (the main column) and the drawer on every other page. History and steps are server-rendered
// htmx regions; this file adds what streams: the reply, the "working" line, Stop/Reset, the page
// context sent with each message (This page / Whole yard), and the assistant's browser actions
// (`ui_action`: open a page, highlight an element). Agent and user text go in via textContent.
(() => {
  const NOT_RUNNING = "The assistant is not running. Start it with `pnpm --dir apps/chat start`, then reload.";
  const OPEN_KEY = "assistant-open";
  const store = {
    get: (k) => {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        if (v === null) sessionStorage.removeItem(k);
        else sessionStorage.setItem(k, v);
      } catch {
        // storage blocked: the drawer just does not reopen by itself
      }
    },
  };

  // [copy] next to an ERR- reference.
  document.addEventListener("click", async (e) => {
    const button = e.target.closest?.("[data-copy]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1500);
    } catch {
      // the reference is selectable text
    }
  });

  // --- drawer: context toggle, close, start, reopen after the assistant navigated ----------------
  const drawer = document.getElementById("assistant");

  const pageContext = () => {
    if (!drawer) return { kind: "portal" };
    const page = drawer.querySelector('[data-ctx="page"][aria-pressed="true"]');
    const raw = drawer.dataset.assistantContext;
    if (!page || !raw) return { kind: "portal" };
    try {
      return { kind: "page", page: JSON.parse(raw) };
    } catch {
      return { kind: "portal" };
    }
  };

  drawer?.addEventListener("click", async (e) => {
    const toggle = e.target.closest?.("[data-ctx]");
    if (toggle && !toggle.disabled) {
      const ctx = toggle.dataset.ctx;
      drawer.querySelectorAll("[data-ctx]").forEach((b) => b.setAttribute("aria-pressed", String(b === toggle)));
      drawer.querySelectorAll("[data-ctx-panel]").forEach((p) => (p.hidden = p.dataset.ctxPanel !== ctx));
      const input = drawer.querySelector("[data-assistant-input]");
      if (input) input.placeholder = ctx === "page" ? "Ask about this page" : "Ask about the whole portal";
      return;
    }
    if (e.target.closest?.("[data-assistant-close]")) {
      store.set(OPEN_KEY, null);
      document.getElementById("ask-assistant")?.click();
      return;
    }
    const start = e.target.closest?.("[data-assistant-start]");
    if (start) {
      start.disabled = true;
      try {
        const r = await fetch("/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(start.dataset.portal ? { portal: start.dataset.portal } : {}),
        });
        if (!r.ok) throw new Error(String(r.status));
        const body = drawer.querySelector(".mp-drawer-body");
        await window.htmx?.ajax("GET", "/fragments/assistant", { target: body, swap: "innerHTML" });
      } catch {
        start.disabled = false;
        start.textContent = "Could not start; retry";
      }
    }
  });

  // The drawer stays open across the pages the assistant opens (sessionStorage, per tab).
  document.addEventListener("assistant-open", () => store.set(OPEN_KEY, "1"));
  if (drawer && store.get(OPEN_KEY) === "1") {
    queueMicrotask(() => document.getElementById("ask-assistant")?.click());
  }

  // --- one assistant (Home or the loaded drawer body) -------------------------------------------
  const wire = (root) => {
    if (root.dataset.wired) return;
    root.dataset.wired = "1";
    const live = root.querySelector("[data-assistant-live]");
    const scroll = root.querySelector("[data-assistant-scroll]");
    const working = root.querySelector("[data-assistant-working]");
    const now = root.querySelector("[data-assistant-now]");
    const form = root.querySelector("[data-assistant-form]");
    const input = root.querySelector("[data-assistant-input]");
    const send = root.querySelector("[data-assistant-send]");
    const stop = root.querySelector("[data-assistant-stop]");
    const reset = document.querySelector("[data-assistant-reset]");
    const serviceUp = root.dataset.serviceUp === "1";
    const openTools = new Map();
    let stream = null;
    let sending = false;
    let clearLiveAfterSwap = false;
    window.chatBusy = false;

    const toBottom = () => {
      scroll.scrollTop = scroll.scrollHeight;
    };
    const scanRunning = () => document.getElementById("region-chat-progress")?.dataset.running === "1";
    const stepActive = () => document.getElementById("region-chat-tracker")?.dataset.active === "1";

    const refresh = () => {
      const on = window.chatBusy || stepActive() || scanRunning();
      working.hidden = !window.chatBusy;
      if (input) input.disabled = window.chatBusy || !serviceUp;
      if (send) send.disabled = window.chatBusy || !serviceUp;
      if (stop) stop.hidden = !on || !serviceUp;
      if (reset) reset.disabled = window.chatBusy || !serviceUp;
      root.setAttribute("aria-busy", String(window.chatBusy));
    };

    const msg = (role, text) => {
      const div = document.createElement("div");
      if (role === "user") {
        div.className = "sy-msg sy-msg--user";
        div.textContent = text;
        live.append(div);
        toBottom();
        return { div, body: div };
      }
      div.className = "sy-msg";
      const who = document.createElement("span");
      who.className = "sy-msg__who";
      who.textContent = "Assistant";
      const body = document.createElement("p");
      body.className = "mp-pre";
      body.textContent = text;
      div.append(who, body);
      live.append(div);
      toBottom();
      return { div, body };
    };

    const divider = (text) => {
      const div = document.createElement("div");
      div.className = "sy-chat__divider";
      div.setAttribute("role", "status");
      div.textContent = text;
      live.append(div);
      toBottom();
    };

    const failure = (message, ref) => {
      const box = document.createElement("div");
      box.className = "sy-callout sy-callout--failure";
      const p = document.createElement("p");
      p.textContent = message;
      box.append(p);
      if (ref) {
        const r = document.createElement("p");
        r.className = "sy-small";
        r.append("reference ");
        const a = document.createElement("a");
        a.className = "sy-mono";
        a.href = `/chat/errors/${encodeURIComponent(ref)}`;
        a.textContent = ref;
        r.append(a);
        box.append(r);
      }
      live.append(box);
      toBottom();
    };

    const describe = () => {
      if (!window.chatBusy) return;
      if (openTools.size === 0) now.textContent = "Thinking";
      else {
        const last = [...openTools.values()].at(-1);
        now.textContent = last.tool === "Agent" ? "Working on a subtask" : `Running ${last.tool ?? "a tool"}`;
      }
    };

    const setBusy = (busy) => {
      window.chatBusy = busy;
      if (!busy) {
        openTools.clear();
        stream = null;
      }
      refresh();
      describe();
    };

    // The assistant's browser actions (spec 022 R6). A highlight opens the screen with the
    // element marked; the server draws it, so it also works after a reload.
    const act = (d) => {
      store.set(OPEN_KEY, root.dataset.mode === "drawer" ? "1" : null);
      if (d.action === "open" && typeof d.path === "string" && d.path.startsWith("/")) {
        location.href = d.path;
      } else if (d.action === "highlight" && d.stateId) {
        const q = d.elementKey ? `?hl=${encodeURIComponent(d.elementKey)}` : "?hl=";
        location.href = `/states/${encodeURIComponent(d.stateId)}${q}`;
      }
    };

    const handlers = {
      status: (d) => {
        if (sending || d.busy === window.chatBusy) return;
        setBusy(Boolean(d.busy));
      },
      message_chunk: (d) => {
        if (!stream) stream = msg("assistant", "");
        stream.body.textContent += d.text;
        toBottom();
      },
      message_done: () => {
        stream = null;
      },
      tool_started: (d) => {
        openTools.set(d.toolCallId, { tool: d.tool });
        describe();
      },
      tool_finished: (d) => {
        openTools.delete(d.toolCallId);
        describe();
      },
      step_changed: () => window.htmx?.trigger(document.body, "step-changed"),
      refused: (d) => divider(`Not allowed: ${d.reason}`),
      error: (d) => failure(d.message, d.ref),
      notice: (d) => divider(d.text),
      ui_action: act,
      idle: () => {
        setBusy(false);
        clearLiveAfterSwap = true;
        window.htmx?.trigger(document.body, "chat-settled");
        window.htmx?.trigger(document.body, "step-changed");
      },
    };

    document.addEventListener("htmx:after:swap", (e) => {
      const id = e.detail?.ctx?.target?.id;
      if (id === "region-chat-messages" && clearLiveAfterSwap && !window.chatBusy) {
        clearLiveAfterSwap = false;
        live.replaceChildren();
        toBottom();
      }
      if (id === "region-chat-tracker" || id === "region-chat-progress") refresh();
    });

    if (serviceUp) {
      const source = new EventSource(root.dataset.eventsUrl);
      for (const [name, handler] of Object.entries(handlers)) {
        source.addEventListener(name, (e) => {
          let data = {};
          try {
            data = JSON.parse(e.data);
          } catch {
            return;
          }
          handler(data);
        });
      }
      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
          failure(NOT_RUNNING, null);
          setBusy(false);
        }
      };
    }

    const submit = async (text) => {
      if (!text || window.chatBusy) return;
      setBusy(true);
      const mine = msg("user", text);
      input.value = "";
      sending = true;
      try {
        const r = await fetch(root.dataset.sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, context: root.dataset.mode === "drawer" ? pageContext() : { kind: "portal" } }),
        });
        sending = false;
        if (r.status === 202) return;
        let body = {};
        try {
          body = await r.json();
        } catch {
          // not JSON
        }
        mine.div.remove();
        failure(body.message ?? "The message could not be sent.", body.ref);
        input.value = text;
        if (r.status !== 409) setBusy(false);
      } catch {
        sending = false;
        mine.div.remove();
        failure(NOT_RUNNING, null);
        input.value = text;
        setBusy(false);
      }
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit(input.value.trim());
    });
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit(input.value.trim());
      }
    });
    document.addEventListener("click", (e) => {
      const say = e.target.closest?.("[data-chat-say]");
      if (say && !say.disabled) submit(say.dataset.chatSay);
    });
    stop?.addEventListener("click", async () => {
      stop.disabled = true;
      try {
        const r = await fetch(root.dataset.cancelUrl, { method: "POST" });
        if (!r.ok) failure("The assistant could not be stopped.", null);
      } catch {
        failure(NOT_RUNNING, null);
      } finally {
        stop.disabled = false;
        window.htmx?.trigger(document.body, "step-changed");
      }
    });
    reset?.addEventListener("click", async () => {
      if (!window.confirm("Reset the assistant's context? The history stays.")) return;
      reset.disabled = true;
      try {
        const r = await fetch(reset.dataset.resetUrl, { method: "POST" });
        if (!r.ok) failure("The assistant could not be reset.", null);
      } catch {
        failure(NOT_RUNNING, null);
      } finally {
        refresh();
        window.htmx?.trigger(document.body, "chat-settled");
      }
    });

    toBottom();
    refresh();
  };

  const wireAll = (root) => root.querySelectorAll?.("[data-assistant]").forEach(wire);
  wireAll(document);
  document.addEventListener("htmx:after:swap", (e) => {
    const target = e.detail?.ctx?.target;
    if (target) wireAll(target);
  });
})();
