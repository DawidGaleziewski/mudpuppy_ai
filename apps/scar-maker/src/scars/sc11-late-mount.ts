// SC-11 (field H-3): a service form is mounted by a micro-frontend 2.5 s after the shell settled,
// into a host element the crawler cannot know is a mount point (no `id="root"`, no import map).
// Unwaited, the snapshot and screenshot show an empty shell. Fixed by the `wait-for-mount`
// fix-plugin with the owner's selector.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const mount = `<script>
setTimeout(function () {
  document.querySelector('.x-widget-host').innerHTML =
    '<form aria-label="Report a claim"><label for="claim">Claim number</label><input id="claim" name="claim">' +
    '<label for="what">What happened</label><textarea id="what" name="what"></textarea></form>';
}, 2500);
</script>`;

export const sc11: Scar = {
  id: 'SC-11',
  entry: '/sc11/',
  routes: {
    '/sc11/': (_req, res) =>
      html(res, page('Report a claim', `<section class="x-widget-host"></section>${mount}`)),
  },
};
