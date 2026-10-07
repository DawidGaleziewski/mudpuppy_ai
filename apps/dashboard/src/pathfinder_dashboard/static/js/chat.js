// Chat page (spec 010, R-30): sends messages and shows the streamed reply, the "what is happening
// now" line and the working animation. History and steps are server-rendered regions (htmx);
// this file only adds what streams. Everything user- or agent-supplied goes in via textContent.
(() => {
  // [copy] next to an ERR- reference.
  document.addEventListener("click", async (e) => {
    const button = e.target.closest?.("[data-copy]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "[copied]";
      setTimeout(() => (button.textContent = "[copy]"), 1500);
    } catch {
      // No clipboard permission: the reference is selectable text, nothing else to do.
    }
  });

  const root = document.getElementById("chat");
  if (!root) return;

  const live = document.getElementById("chat-live");
  const scroll = document.getElementById("chat-scroll");
  const now = document.getElementById("chat-now");
  const working = document.getElementById("chat-working");
  const workingText = working.querySelector(".working-text");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const send = document.getElementById("chat-send");
  const stop = document.getElementById("chat-stop");
  const reset = document.getElementById("chat-reset");
  const serviceUp = root.dataset.serviceUp === "1";
  const NOT_RUNNING =
    "The chat service is not running. Start it with `pnpm --dir apps/chat start`, then reload.";

  window.chatBusy = false; // read by the history region's trigger filter
  let clearLiveAfterSwap = false;
  let stream = null; // the assistant bubble being streamed
  const openTools = new Map(); // toolCallId -> { tool, parent }
  let crawlerSeen = false;

  const trackerActive = () =>
    document.getElementById("region-chat-tracker")?.dataset.active === "1";
  const runRunning = () =>
    document.getElementById("region-chat-progress")?.dataset.running === "1";

  // The animation shows from send until idle, while any step is pending or in progress, and
  // while the conversation's run is running (T048: also after leaving the page and coming back).
  const refreshWorking = () => {
    const on = window.chatBusy || trackerActive() || runRunning();
    working.hidden = !on;
    workingText.textContent = window.chatBusy
      ? "The assistant is working."
      : "A scan is running. It keeps going if you leave this page.";
    input.disabled = window.chatBusy || !serviceUp;
    send.disabled = window.chatBusy || !serviceUp;
    stop.hidden = !on || !serviceUp;
    if (reset) reset.disabled = window.chatBusy || !serviceUp;
    root.setAttribute("aria-busy", String(window.chatBusy));
  };

  const bubble = (role, label, text) => {
    const li = document.createElement("li");
    li.className = `msg msg-${role}`;
    const head = document.createElement("p");
    head.className = "msg-head";
    const who = document.createElement("span");
    who.className = "msg-role";
    who.textContent = label;
    head.append(who);
    const body = document.createElement("p");
    body.className = "msg-body";
    body.textContent = text;
    li.append(head, body);
    live.append(li);
    scroll.scrollTop = scroll.scrollHeight;
    return { li, body };
  };

  const notice = (text) => {
    const li = document.createElement("li");
    const p = document.createElement("p");
    p.className = "notice";
    p.setAttribute("role", "status");
    p.textContent = text;
    li.append(p);
    live.append(li);
    scroll.scrollTop = scroll.scrollHeight;
  };

  const errorBubble = (message, ref) => {
    const { li } = bubble("system", "System", message);
    li.classList.add("msg-error");
    if (!ref) return;
    const p = document.createElement("p");
    p.className = "msg-ref";
    const tag = document.createElement("span");
    tag.className = "st st-fail";
    tag.textContent = "[FAIL]";
    const wrap = document.createElement("span");
    wrap.className = "err-ref";
    const lead = document.createElement("span");
    lead.className = "muted";
    lead.textContent = "reference ";
    const code = document.createElement("code");
    code.textContent = ref;
    const lookup = document.createElement("a");
    lookup.href = `/chat/errors/${encodeURIComponent(ref)}`;
    lookup.title = "Look up this reference in the error log";
    lookup.append(code);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn-bracket";
    copy.dataset.copy = ref;
    copy.setAttribute("aria-label", `Copy reference ${ref}`);
    copy.textContent = "[copy]";
    wrap.append(lead, lookup, " ", copy);
    p.append(tag, " ", wrap);
    li.append(p);
  };

  const describeNow = () => {
    if (!window.chatBusy) {
      now.textContent = "";
      return;
    }
    if (openTools.size === 0) {
      now.textContent = "Thinking…";
      return;
    }
    const last = [...openTools.values()].at(-1);
    if (crawlerSeen) now.textContent = "Crawler is mapping the portal…";
    else if (last.tool === "Agent") now.textContent = "Working on a subtask…";
    else now.textContent = `Running: ${last.tool ?? "a tool"}`;
  };

  // A turn that sends nothing for this long is called out (F-22): a background crawler reports
  // every page, so silence means the assistant is stuck, not busy.
  const QUIET_MS = 5 * 60_000;
  let lastEventAt = Date.now();
  setInterval(() => {
    const quiet = Date.now() - lastEventAt;
    if (!window.chatBusy || quiet < QUIET_MS) return;
    now.textContent = `No activity for ${Math.floor(quiet / 60_000)} min. The assistant may be stuck; [stop] ends it.`;
  }, 15_000);

  const setBusy = (busy) => {
    lastEventAt = Date.now();
    window.chatBusy = busy;
    if (!busy) {
      openTools.clear();
      crawlerSeen = false;
      stream = null;
    }
    refreshWorking();
    describeNow();
  };

  let sending = false; // between [send] and the service's 202

  const handlers = {
    // T048: sent first on every (re)connect. A page opened mid-turn shows the assistant working.
    status: (d) => {
      if (sending || d.busy === window.chatBusy) return;
      setBusy(Boolean(d.busy));
      if (d.busy) now.textContent = "The assistant is working on your last message…";
    },
    message_chunk: (d) => {
      if (!stream) stream = bubble("assistant", "Assistant", "");
      stream.body.textContent += d.text;
      scroll.scrollTop = scroll.scrollHeight;
    },
    message_done: () => {
      stream = null;
    },
    tool_started: (d) => {
      openTools.set(d.toolCallId, { tool: d.tool, parent: d.parentToolCallId });
      // A call made by a subagent while an `Agent` call is open: the crawler is at work.
      if (d.parentToolCallId && openTools.get(d.parentToolCallId)?.tool === "Agent") {
        crawlerSeen = true;
      }
      describeNow();
    },
    tool_finished: (d) => {
      openTools.delete(d.toolCallId);
      if (![...openTools.values()].some((t) => t.tool === "Agent")) crawlerSeen = false;
      describeNow();
    },
    step_changed: () => window.htmx?.trigger(document.body, "step-changed"),
    refused: (d) => notice(`Not allowed: ${d.reason}`),
    error: (d) => errorBubble(d.message, d.ref),
    notice: (d) => notice(d.text),
    idle: () => {
      setBusy(false);
      clearLiveAfterSwap = true;
      window.htmx?.trigger(document.body, "chat-settled");
      window.htmx?.trigger(document.body, "step-changed");
    },
  };

  // htmx 4 fires `htmx:after:swap` with the swap target in `detail.ctx`. Once the history region
  // is re-rendered from the store, the streamed copies can go; when the tracker changed, the
  // animation may appear or go.
  document.addEventListener("htmx:after:swap", (e) => {
    const id = e.detail?.ctx?.target?.id;
    if (id === "region-chat-messages" && clearLiveAfterSwap && !window.chatBusy) {
      clearLiveAfterSwap = false;
      live.replaceChildren();
      scroll.scrollTop = scroll.scrollHeight;
    }
    if (id === "region-chat-tracker" || id === "region-chat-progress") refreshWorking();
  });

  // Server-sent events through the dashboard's proxy. EventSource reconnects by itself and
  // sends Last-Event-ID, which the proxy forwards.
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
        lastEventAt = Date.now();
        handler(data);
      });
    }
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        now.textContent = NOT_RUNNING;
        setBusy(false);
      } else if (window.chatBusy) {
        now.textContent = "Connection lost, reconnecting…";
      }
    };
    source.onopen = () => describeNow();
  } else {
    now.textContent = NOT_RUNNING;
  }

  const submit = async () => {
    const text = input.value.trim();
    if (!text || window.chatBusy) return;
    setBusy(true);
    now.textContent = "Sending…";
    const mine = bubble("user", "You", text);
    input.value = "";
    sending = true;
    try {
      const response = await fetch(root.dataset.sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      sending = false;
      if (response.status === 202) {
        describeNow();
        return;
      }
      let body = {};
      try {
        body = await response.json();
      } catch {
        // not JSON: fall through to the generic message
      }
      const busy = response.status === 409; // another turn is still running
      mine.li.remove();
      errorBubble(body.message ?? "The message could not be sent.", body.ref);
      input.value = text;
      if (busy) describeNow();
      else setBusy(false);
    } catch {
      sending = false;
      mine.li.remove();
      errorBubble(NOT_RUNNING, null);
      input.value = text;
      setBusy(false);
    }
  };

  // [stop] (T050): ends the assistant's turn and every run this conversation follows. The turn's
  // `idle` event and the tracker refresh then hide the button.
  stop.addEventListener("click", async () => {
    stop.disabled = true;
    now.textContent = "Stopping…";
    try {
      const response = await fetch(root.dataset.cancelUrl, { method: "POST" });
      if (!response.ok) {
        let body = {};
        try {
          body = await response.json();
        } catch {
          // not JSON: generic message below
        }
        errorBubble(body.message ?? "The assistant could not be stopped.", body.ref);
      }
    } catch {
      errorBubble(NOT_RUNNING, null);
    } finally {
      stop.disabled = false;
      window.htmx?.trigger(document.body, "step-changed");
    }
  });

  // [reset assistant] (T051): a fresh assistant context; the notice lands in the history.
  reset?.addEventListener("click", async () => {
    if (!window.confirm("Reset the assistant's context? The history stays on screen.")) return;
    reset.disabled = true;
    try {
      const response = await fetch(reset.dataset.resetUrl, { method: "POST" });
      if (!response.ok) {
        let body = {};
        try {
          body = await response.json();
        } catch {
          // not JSON: generic message below
        }
        errorBubble(body.message ?? "The assistant could not be reset.", body.ref);
      }
    } catch {
      errorBubble(NOT_RUNNING, null);
    } finally {
      refreshWorking();
      window.htmx?.trigger(document.body, "chat-settled");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  // [resume scan] on a stopped step (spec 011 F-04): says it in the chat, as if typed, so the
  // request shows in the history and the assistant resumes the run with its own choices.
  document.addEventListener("click", (e) => {
    const button = e.target.closest?.("[data-chat-say]");
    if (!button || button.disabled) return;
    input.value = button.dataset.chatSay;
    submit();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  scroll.scrollTop = scroll.scrollHeight;
  refreshWorking();
})();
