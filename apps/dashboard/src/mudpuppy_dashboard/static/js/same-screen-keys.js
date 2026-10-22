// Same screen? (spec 039 T100, designer screen v2-14): 1 / 2 / 3 pick an answer, W moves to Why,
// Enter saves, S skips to the next pair, Esc goes back (or leaves the Why field). Keys are ignored
// while typing or with a modifier.
(() => {
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return; // Esc closes the picture first
    const form = document.querySelector('form[data-same-screen]');
    if (!form) return;
    if (typing(e.target)) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const pick = form.querySelector(`input[name="answer"][aria-keyshortcuts="${e.key}"]`);
    if (pick) {
      e.preventDefault();
      pick.checked = true;
      pick.focus();
    } else if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      form.querySelector('input[name="why"]')?.focus();
    } else if (e.key === 'Enter' && form.querySelector('input[name="answer"]:checked')) {
      e.preventDefault();
      form.requestSubmit();
    } else if (e.key === 's' || e.key === 'S') {
      form.querySelector('a[data-key="s"]')?.click();
    } else if (e.key === 'Escape') {
      document.querySelector('.sy-crumbs a')?.click();
    }
  });
})();
