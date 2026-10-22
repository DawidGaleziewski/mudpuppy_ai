// Review queue keys (spec 040 T012, designer 12-v2-ux.md § 5.2): J / K move through the queue,
// Enter opens an item, X selects it, C / R start a confirm or a reject in the detail's reason
// field (Enter saves, Esc cancels), Shift C confirms the selection, U undoes the last decision,
// / goes to the filter, ? lists them all. Keys work only while focus is in the queue, the detail
// or nowhere in particular, never while typing (WCAG 2.1.4); every key has a visible button, and
// the shortcuts dialog turns them off in this browser.
(() => {
  const OFF = 'mp.review-keys-off';
  const off = () => {
    try {
      return localStorage.getItem(OFF) === '1';
    } catch {
      return false;
    }
  };
  const typing = (el) =>
    el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const inScope = (el) =>
    !el || el === document.body || !!el.closest('#review-panel, .mp-review-side, [data-review-keybar]');
  const items = () => [...document.querySelectorAll('#review-panel [data-queue-item]')];

  function move(step) {
    const all = items();
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement);
    const from = at >= 0 ? at : all.findIndex((a) => a.getAttribute('aria-current') === 'true');
    const next = all[Math.min(all.length - 1, Math.max(0, (from < 0 ? -1 : from) + step))];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  function toggleSelected() {
    const row = document.activeElement?.closest('.mp-pick');
    const box = row?.querySelector('[data-pick-item]');
    if (!box) return;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function startDecision(intent) {
    const form = document.querySelector('[data-review-decide]');
    const reason = form?.querySelector('[data-review-reason]');
    if (!reason) return;
    form.dataset.intent = intent;
    reason.placeholder = intent === 'reject' ? 'Why reject? (required)' : 'Why? (optional)';
    reason.focus();
  }

  function submit(form, intent) {
    const button = form?.querySelector(`button[name="action"][value="${intent}"]`);
    if (button) form.requestSubmit(button);
  }

  // Enter in the detail's reason field saves the decision C or R started; Esc cancels it.
  document.addEventListener('keydown', (e) => {
    const reason = e.target.closest?.('[data-review-reason]');
    if (!reason) return;
    const form = reason.form;
    if (e.key === 'Enter' && form?.dataset.intent) {
      e.preventDefault();
      submit(form, form.dataset.intent);
    } else if (e.key === 'Escape') {
      delete form.dataset.intent;
      reason.blur();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (off() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target) || !inScope(document.activeElement)) return;
    if (document.querySelector('dialog[open]')) return;
    const act = {
      j: () => move(1),
      k: () => move(-1),
      x: toggleSelected,
      c: () => (e.shiftKey ? submit(document.querySelector('[data-pick]'), 'confirm') : startDecision('confirm')),
      r: () => startDecision('reject'),
      u: () => document.querySelector('[data-key="u"]')?.click(),
      '/': () => document.querySelector('[data-review-filter]')?.focus(),
      '?': () => document.getElementById('review-keys')?.showModal(),
    }[e.key.toLowerCase()];
    if (act) {
      e.preventDefault();
      act();
    }
  });

  // The selection count, and the visible buttons of the shortcuts dialog.
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-pick-item]')) {
      const form = document.getElementById(e.target.getAttribute('form'));
      const count = form?.querySelector('[data-pick-count]');
      if (count) count.textContent = String(document.querySelectorAll(`[form="${form.id}"]:checked`).length);
    } else if (e.target.matches?.('[data-review-keys-off]')) {
      try {
        localStorage.setItem(OFF, e.target.checked ? '1' : '0');
      } catch {
        /* storage blocked: the setting lasts for this page only */
      }
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-review-help]')) {
      const box = document.querySelector('[data-review-keys-off]');
      if (box) box.checked = off();
      document.getElementById('review-keys')?.showModal();
    } else if (e.target.closest?.('[data-review-help-close]')) {
      document.getElementById('review-keys')?.close();
    }
  });
})();
