// Copy buttons (spec 040 T014, F-55): a `[data-copy-from="<id>"]` button copies the text of the
// element with that id, and says so in its own label for a moment. Works on content htmx loads
// later (one listener on the document). Without clipboard access the text stays selectable.
(() => {
  document.addEventListener('click', async (e) => {
    const button = e.target.closest?.('[data-copy-from]');
    if (!button) return;
    const source = document.getElementById(button.dataset.copyFrom);
    if (!source) return;
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(source.textContent);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select the text to copy';
    }
    setTimeout(() => (button.textContent = label), 1500);
  });
})();
