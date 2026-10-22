// As of a past model version (spec 040 FR-001): nothing is changed, so every form that writes
// (method post) gets its controls disabled, also in fragments htmx loads later. The server
// refuses such posts as well (app.py); this only says so before the click.
(() => {
  const NOTE = 'Back to now to change anything';
  const seq = document.body.dataset.asOf;
  const off = (root) => {
    for (const form of root.querySelectorAll('form[method="post" i]')) {
      for (const el of form.querySelectorAll('button, input, select, textarea')) {
        el.disabled = true;
        el.title = NOTE;
      }
    }
    // A filter form (method get) stays in the past: it sends as_of along.
    for (const form of root.querySelectorAll('form:not([method="post" i])')) {
      if (form.querySelector('input[name="as_of"]')) continue;
      const keep = document.createElement('input');
      keep.type = 'hidden';
      keep.name = 'as_of';
      keep.value = seq;
      form.append(keep);
    }
  };
  document.addEventListener('DOMContentLoaded', () => off(document));
  document.addEventListener('htmx:afterSwap', (e) => off(e.target));
})();
