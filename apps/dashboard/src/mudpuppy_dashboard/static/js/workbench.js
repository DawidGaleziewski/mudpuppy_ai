// Workbench page (spec 043; designer 14-workbench.md § 5, 17-genui-architecture.md § 5.5): the
// composer (Enter sends, suggestions send their text), point and ask (Ask buttons and A add a
// context chip, at most 3; chips travel as JSON ids, never as text), Why this view? and Expand,
// selection (sel replaces the URL), Esc closes the innermost thing, answer-first timing (Still
// working after 4 s, no view after 15 s), the stale stream (no message for 30 s), the live bar,
// and one polite announcement per new view or stop. Single-letter keys never fire while typing
// and can be turned off in this browser (WCAG 2.1.4). No framework.
(() => {
  const OFF = 'mp.workbench-keys-off';
  const keysOff = () => {
    try {
      return localStorage.getItem(OFF) === '1';
    } catch {
      return false;
    }
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const typing = (el) =>
    el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const announce = (text) => {
    const region = $('#wb-announce');
    if (region) region.textContent = text;
  };

  // --- composer, suggestions, chips ------------------------------------------------------------
  const composer = () => $('#wb-composer');
  const field = () => composer()?.querySelector('textarea[name="text"]');
  const chipsInput = () => $('#wb-ctx');

  function chips() {
    try {
      const value = JSON.parse(chipsInput()?.value || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function chipLabel(c) {
    if (c.kind === 'page') return `${c.route}${c.state > 1 ? ` · step ${c.state}` : ''}`;
    if (c.kind === 'event') return `step ${c.ref.split('#')[1]}`;
    if (c.kind === 'step') return `step ${c.step}`;
    return 'this view';
  }

  function renderChips(list) {
    const bar = $('#wb-chips');
    if (!bar || !chipsInput()) return;
    chipsInput().value = JSON.stringify(list);
    bar.replaceChildren(
      ...list.map((c, i) => {
        const chip = document.createElement('span');
        chip.className = 'sy-ctxchip';
        const at = document.createElement('span');
        at.className = 'sy-ctxchip__at';
        at.textContent = '@';
        const text = document.createElement('span');
        text.textContent = chipLabel(c);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'sy-ctxchip__remove';
        remove.setAttribute('aria-label', `Stop asking about ${chipLabel(c)}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => renderChips(chips().filter((_, j) => j !== i)));
        chip.append(at, text, remove);
        return chip;
      }),
    );
  }

  function ask(el) {
    const raw = el?.closest('[data-wb-ask]')?.getAttribute('data-wb-ask');
    if (!raw) return;
    let chip;
    try {
      chip = JSON.parse(raw);
    } catch {
      return;
    }
    const same = (c) => JSON.stringify(c) === JSON.stringify(chip);
    const list = chips().filter((c) => !same(c));
    list.push(chip);
    renderChips(list.slice(-3)); // a fourth replaces the oldest (WB-UI-11)
    field()?.focus();
  }

  function send(text) {
    const box = field();
    if (!box || box.disabled) return;
    box.value = text;
    composer().requestSubmit();
  }

  document.addEventListener('submit', (e) => {
    if (e.target !== composer()) return;
    if (!field()?.value.trim()) {
      e.preventDefault();
      return;
    }
    // Cleared after htmx has read the form (WB-UI-12: the chips go with the message).
    setTimeout(() => {
      field().value = '';
      renderChips([]);
      waitForAnswer();
    }, 0);
  });

  document.addEventListener('keydown', (e) => {
    const box = field();
    if (e.target === box && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      composer().requestSubmit();
    }
  });

  // --- answer-first timing (WB-UI-29, -30) ----------------------------------------------------
  const STILL_MS = 4000;
  const VIEW_MS = 15000;

  const latestPending = () => [...document.querySelectorAll('[data-wb-pending]')].at(-1);
  const empty = (pending) => {
    const text = pending.querySelector('[id$="-text"]');
    const views = pending.querySelector('[id$="-views"]');
    return !text?.textContent.trim() && !views?.children.length;
  };

  // An answer streamed before this turn was on the page would be lost (F-16): ask for the turn
  // as the store has it and fill its containers by id.
  async function catchUp() {
    const pending = latestPending();
    const conversation = $('#wb-root')?.dataset.conversation;
    const n = pending?.id.match(/^turn-t(\d+)$/)?.[1];
    if (!pending || !conversation || !n || !empty(pending)) return;
    const url = new URL('/workbench/turn', location.origin);
    for (const [k, v] of new URL(location.href).searchParams) if (k === 'env') url.searchParams.set(k, v);
    url.searchParams.set('c', conversation);
    url.searchParams.set('n', n);
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) return;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    for (const part of doc.body.children) {
      const target = part.id && document.getElementById(part.id);
      if (target && part.innerHTML.trim()) {
        target.innerHTML = part.innerHTML;
        window.htmx?.process?.(target);
      }
    }
  }

  function waitForAnswer() {
    setTimeout(catchUp, 1500);
    setTimeout(() => {
      const pending = latestPending();
      if (!pending || !empty(pending)) return;
      const text = pending.querySelector('[id$="-text"]');
      const status = document.createElement('span');
      status.className = 'sy-genstatus';
      status.textContent = 'Still working';
      status.dataset.wbStill = '';
      text?.append(status);
    }, STILL_MS);
  }

  function watchComposing(frame) {
    setTimeout(() => {
      if (!frame.isConnected || frame.dataset.genState !== 'composing') return;
      const line = document.createElement('p');
      line.className = 'sy-small sy-muted';
      line.textContent = 'No view this time; the answer is above.';
      frame.replaceWith(line);
    }, VIEW_MS);
  }

  // --- stream health (WB-UI-32) ----------------------------------------------------------------
  const STALE_MS = 30000;
  let lastSeen = Date.now();
  let stale = false;

  function setStale(on) {
    if (on === stale) return;
    stale = on;
    for (const live of document.querySelectorAll('[data-wb-live]')) {
      const frame = live.closest('.sy-genview');
      if (!frame) continue;
      frame.dataset.genState = on ? 'stale' : 'ready';
      const notice = frame.querySelector('[data-wb-stale-notice]');
      if (on && !notice) {
        const strip = document.createElement('div');
        strip.className = 'sy-genview__notice';
        strip.dataset.wbStaleNotice = '';
        const at = new Date(lastSeen).toISOString().slice(11, 19);
        strip.textContent = `Live updates paused at ${at}Z · Reconnecting`;
        frame.querySelector('.sy-genview__head')?.after(strip);
      } else if (!on && notice) notice.remove();
    }
    announce(on ? 'Live updates paused' : 'Live updates back');
  }

  const seen = () => {
    lastSeen = Date.now();
    setStale(false);
  };
  for (const name of ['htmx:sse:message', 'heartbeat', 'hello']) document.addEventListener(name, seen);
  setInterval(() => {
    if ($('#wb-root[hx-sse\\:connect]') && Date.now() - lastSeen > STALE_MS) setStale(true);
  }, 5000);

  // --- what arrives in the log -----------------------------------------------------------------
  function arrived(node) {
    if (!(node instanceof Element)) return;
    lastSeen = Date.now();
    for (const still of node.ownerDocument.querySelectorAll('[data-wb-still]')) {
      if (still.parentElement?.textContent.trim() !== still.textContent) still.remove();
    }
    const frames = node.matches('.sy-genview') ? [node] : [...node.querySelectorAll('.sy-genview')];
    for (const frame of frames) {
      if (frame.dataset.genState === 'composing') watchComposing(frame);
      else if (frame.classList.contains('sy-genview--failure')) announce('Scan stopped');
      else if (frame.querySelector('[data-wb-live]')) announce('Live map opened');
    }
    watchLivebar();
  }

  const log = $('#wb-log');
  if (log) {
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) arrived(n);
    }).observe(log, { childList: true, subtree: true });
  }

  // --- live bar (WB-UI-16) ---------------------------------------------------------------------
  let barObserver = null;
  function watchLivebar() {
    const bar = $('[data-wb-livebar]');
    barObserver?.disconnect();
    if (!bar) return;
    const card = document.getElementById(bar.dataset.wbLivebar);
    if (!card) return;
    barObserver = new IntersectionObserver(([entry]) => {
      bar.hidden = entry.isIntersecting;
    });
    barObserver.observe(card);
  }
  watchLivebar();

  // --- clicks ----------------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const suggest = t.closest('[data-wb-suggest]');
    if (suggest) {
      e.preventDefault();
      send(suggest.getAttribute('data-wb-suggest'));
      return;
    }
    if (t.closest('.sy-ask') || t.closest('button[data-wb-ask]')) {
      e.preventDefault();
      ask(t);
      return;
    }
    const why = t.closest('.sy-genview__why');
    if (why) {
      const panel = document.getElementById(why.getAttribute('aria-controls'));
      const open = why.getAttribute('aria-expanded') !== 'true';
      why.setAttribute('aria-expanded', String(open));
      if (panel) panel.hidden = !open;
      return;
    }
    const expand = t.closest('[data-wb-expand]');
    if (expand) {
      const body = document.getElementById(expand.getAttribute('aria-controls'));
      const open = expand.getAttribute('aria-expanded') !== 'true';
      expand.setAttribute('aria-expanded', String(open));
      expand.textContent = open ? 'Fold' : 'Expand';
      if (body) body.hidden = !open;
      return;
    }
    const pathTo = t.closest('[data-wb-path]');
    if (pathTo) {
      const button = document.querySelector(
        `#wb-path button[value="${pathTo.getAttribute('data-wb-path')}"]`,
      );
      button?.click();
      return;
    }
    const select = t.closest('[data-wb-select]');
    if (select) {
      // Selecting fills the side sheet; the URL is replaced, never pushed (WB-UI-07).
      const url = new URL(location.href);
      url.searchParams.set('sel', select.getAttribute('data-wb-select'));
      location.replace(url.toString());
    }
  });

  // --- keys (WB-UI-37, -38) --------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const why = [...document.querySelectorAll('.sy-genview__why[aria-expanded="true"]')].at(-1);
      if (why) {
        why.click();
        why.focus();
        return;
      }
      const close = $('[data-wb-close]');
      if (close) location.replace(close.href);
      return;
    }
    if (typing(e.target) || keysOff() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'a' || e.key === 'A') {
      const target = document.activeElement?.closest('[data-wb-ask]');
      if (target) {
        e.preventDefault();
        ask(target);
      }
    }
  });

  // The sheet opened by a selection gets focus on its heading (WB-UI-35: after the person acted).
  if (new URL(location.href).searchParams.get('sel')) $('#sheet-h')?.focus();
})();
