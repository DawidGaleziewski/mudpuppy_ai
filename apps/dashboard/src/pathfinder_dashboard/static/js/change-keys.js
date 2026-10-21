// Before / after (spec 039 T100, designer screen v2-03): J / K open the next / previous change
// that needs you, Esc goes back to What changed. Keys are ignored while typing or with a modifier.
(() => {
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (document.querySelector('dialog[open]')) return; // Esc closes the picture first
    const key = e.key.toLowerCase();
    const link = document.querySelector(`a[data-key="${key}"]`);
    if (link) {
      e.preventDefault();
      link.click();
    } else if (e.key === 'Escape') {
      const back = document.querySelector('.sy-crumbs a');
      if (back) back.click();
    }
  });
})();
