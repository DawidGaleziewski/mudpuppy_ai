// Copies the Salvage Yard design system (the design package is its source of truth,
// docs/design/salvage-yard/design-system) into src/design-system/assets, so the React app and
// Storybook load exactly the designer's tokens, CSS and fonts. `pnpm ds:sync` after the designer
// ships a change; `tests/design-system-drift.test.ts` fails while the copy differs.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE = join(here, '../../../docs/design/salvage-yard/design-system');
export const TARGET = join(here, '../src/design-system/assets');
export const FILES = [
  'css/tokens.css',
  'css/fonts.css',
  'css/salvage.css',
  'css/genui.css',
  'tag-icon.svg',
  'fonts/Archivo-Variable.woff2',
  'fonts/IBMPlexMono-Regular.woff2',
  'fonts/IBMPlexMono-Medium.woff2',
  'fonts/IBMPlexMono-SemiBold.woff2',
  'fonts/SpecialElite-Regular.woff2',
  'fonts/OFL-Archivo.txt',
  'fonts/OFL-IBMPlexMono.txt',
  'fonts/LICENSE-SpecialElite.txt',
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of FILES) {
    mkdirSync(dirname(join(TARGET, f)), { recursive: true });
    cpSync(join(SOURCE, f), join(TARGET, f));
  }
  console.log(`copied ${String(FILES.length)} design-system files to ${TARGET}`);
}
